// @ts-nocheck
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    let user;
    try {
        user = await requireAuth(req, res);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!user) return;

    try {
        // --- 1. GET - List Staff ---
        if (req.method === 'GET') {
            const staffList = await db.query.staff.findMany({
                with: {
                    specialties: true
                },
                orderBy: [desc(schema.staff.created_at)]
            });

            // Format to match StaffSchema (flatten specialties to ID array)
            const formatted = staffList.map(s => ({
                ...s,
                specialties: s.specialties.map(spec => spec.category_id)
            }));

            return res.status(200).json({ staff: formatted });
        }

        // --- 2. POST - Create Staff ---
        if (req.method === 'POST') {
            const { name, phone, role, is_active, work_start, work_end, specialties } = req.body;
            
            const [newStaff] = await db.insert(schema.staff).values({
                name,
                phone,
                role: role || 'staff',
                is_active: is_active ?? true,
                work_start: work_start || '09:00',
                work_end: work_end || '18:00',
            }).returning();

            if (specialties && Array.isArray(specialties)) {
                const specialtiesToInsert = specialties.map(catId => ({
                    staff_id: newStaff.id,
                    category_id: catId
                }));
                if (specialtiesToInsert.length > 0) {
                    await db.insert(schema.staff_specialties).values(specialtiesToInsert);
                }
            }

            return res.status(201).json({ staff: { ...newStaff, specialties: specialties || [] } });
        }

        // --- 3. PUT - Update Staff ---
        if (req.method === 'PUT') {
            const { id, name, phone, role, is_active, work_start, work_end, specialties } = req.body;
            if (!id) return res.status(400).json({ error: 'Missing ID' });

            // Update main info
            const [updatedStaff] = await db.update(schema.staff)
                .set({
                    name,
                    phone,
                    role,
                    is_active,
                    work_start,
                    work_end,
                })
                .where(eq(schema.staff.id, id))
                .returning();

            // Update specialties (delete then insert)
            if (specialties && Array.isArray(specialties)) {
                await db.delete(schema.staff_specialties).where(eq(schema.staff_specialties.staff_id, id));
                const specialtiesToInsert = specialties.map(catId => ({
                    staff_id: id,
                    category_id: catId
                }));
                if (specialtiesToInsert.length > 0) {
                    await db.insert(schema.staff_specialties).values(specialtiesToInsert);
                }
            }

            return res.status(200).json({ staff: { ...updatedStaff, specialties: specialties || [] } });
        }

        // --- 4. DELETE - Delete Staff ---
        if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'Missing ID' });

            await db.delete(schema.staff).where(eq(schema.staff.id, id));
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[API ERROR] Staff:', e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
