
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

    const isStaffOperation = req.url?.includes('staff') || req.body?.type === 'staff';

    try {
        // --- STAFF OPS ---
        if (isStaffOperation) {
            if (req.method === 'GET') {
                const staffList = await sql`SELECT * FROM view_staff_full ORDER BY created_at DESC`;
                return res.status(200).json({ staff: staffList });
            }

            if (req.method === 'POST') {
                const { name, phone, role, is_active, work_start, work_end, specialties } = req.body;
                const [newStaff] = await db.insert(schema.staff).values({ name, phone, role: role || 'staff', is_active: is_active ?? true, work_start: work_start || '09:00', work_end: work_end || '18:00' }).returning();
                if (specialties?.length > 0) {
                    await db.insert(schema.staff_specialties).values(specialties.map(catId => ({ staff_id: newStaff.id, category_id: catId })));
                }
                return res.status(201).json({ staff: { ...newStaff, specialties: specialties || [] } });
            }

            if (req.method === 'PUT') {
                const { id, name, phone, role, is_active, work_start, work_end, specialties } = req.body;
                if (!id) return res.status(400).json({ error: 'Missing ID' });
                const [updatedStaff] = await db.update(schema.staff).set({ name, phone, role, is_active, work_start, work_end }).where(eq(schema.staff.id, id)).returning();
                if (specialties && Array.isArray(specialties)) {
                    await db.delete(schema.staff_specialties).where(eq(schema.staff_specialties.staff_id, id));
                    if (specialties.length > 0) {
                        await db.insert(schema.staff_specialties).values(specialties.map(catId => ({ staff_id: id, category_id: catId })));
                    }
                }
                return res.status(200).json({ staff: { ...updatedStaff, specialties: specialties || [] } });
            }

            if (req.method === 'DELETE') {
                const { id } = req.query;
                if (!id) return res.status(400).json({ error: 'Missing ID' });
                await db.delete(schema.staff).where(eq(schema.staff.id, id));
                return res.status(200).json({ success: true });
            }
        } 
        
        // --- USER ACCOUNT OPS (RBAC) ---
        else {
            if (req.method === 'GET') {
                const users = await sql`
                    SELECT u.*, COALESCE(json_agg(p.category_id), '[]') as category_ids
                    FROM admin_users u
                    LEFT JOIN user_permissions p ON p.user_id = u.id
                    GROUP BY u.id
                    ORDER BY u.created_at DESC
                `;
                return res.status(200).json({ users });
            }

            if (req.method === 'PUT') {
                const { id, username, password, category_ids } = req.body;
                if (!id) return res.status(400).json({ error: 'Missing ID' });
                const [updated] = await db.update(schema.admin_users).set({ username, password_hash: password || undefined }).where(eq(schema.admin_users.id, id)).returning();
                if (category_ids && Array.isArray(category_ids)) {
                    await db.delete(schema.user_permissions).where(eq(schema.user_permissions.user_id, id));
                    if (category_ids.length > 0) {
                        await db.insert(schema.user_permissions).values(category_ids.map(catId => ({ user_id: id, category_id: catId })));
                    }
                }
                return res.status(200).json({ user: updated });
            }
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error(`[TEAM API ERROR]`, e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
