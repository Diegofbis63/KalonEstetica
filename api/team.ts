
import { db, sql } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        if (req.method === 'GET') {
            const staffList = await db.query.staff.findMany({
                with: {
                    specialties: true
                }
            });

            const mappedStaff = staffList.map((s: any) => ({
                id: s.id,
                name: s.name,
                phone: s.phone || null,
                role: s.role || 'staff',
                is_active: Boolean(s.is_active),
                work_start: s.work_start || '09:00',
                work_end: s.work_end || '18:00',
                specialties: (s.specialties || []).map((spec: any) => spec.category_id)
            }));

            return res.status(200).json({ staff: mappedStaff });
        }

        if (req.method === 'POST') {
            const { name, phone, role, is_active, work_start, work_end, specialties } = req.body;
            
            // Insert staff member
            const [newStaff] = await db.insert(schema.staff)
                .values({ name, phone, role, is_active: is_active ?? true, work_start, work_end })
                .returning();

            // Insert specialties
            if (Array.isArray(specialties) && specialties.length > 0) {
                await db.insert(schema.staff_specialties)
                    .values(specialties.map(catId => ({ staff_id: newStaff.id, category_id: catId })));
            }

            return res.status(201).json({ success: true, id: newStaff.id });
        }

        if (req.method === 'PATCH') {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'Missing ID' });
            
            const { name, phone, role, is_active, work_start, work_end, specialties } = req.body;
            
            // Update staff
            await db.update(schema.staff)
                .set({ name, phone, role, is_active, work_start, work_end })
                .where(eq(schema.staff.id, id as string));

            // Sync specialties (delete current and re-insert)
            await db.delete(schema.staff_specialties).where(eq(schema.staff_specialties.staff_id, id as string));
            if (Array.isArray(specialties) && specialties.length > 0) {
                await db.insert(schema.staff_specialties)
                    .values(specialties.map(catId => ({ staff_id: id as string, category_id: catId })));
            }

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[TEAM API ERROR]:', e);
        return res.status(500).json({ error: 'Internal Server Error', details: (e as Error).message });
    }
}
