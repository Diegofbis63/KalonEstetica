
import { db, sql } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // Auth is ALWAYS mandatory for users API
    const authUser = await requireAuth(req, res);
    if (!authUser) return;

    try {
        if (req.method === 'GET') {
            const usersList = await db.query.admin_users.findMany({
                with: {
                    permissions: true
                }
            });

            const mappedUsers = usersList.map((u: any) => ({
                id: u.id,
                username: u.username || u.email.split('@')[0],
                email: u.email || null,
                role: u.role || 'staff',
                category_ids: (u.permissions || []).map((p: any) => p.category_id)
            }));

            return res.status(200).json({ users: mappedUsers });
        }

        if (req.method === 'PATCH') {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'Missing ID' });
            
            const { role, category_ids } = req.body;
            
            // 1. Update basic info
            await db.update(schema.admin_users)
                .set({ 
                    role, 
                })
                .where(eq(schema.admin_users.id, id as string));

            // 2. Sync permissions (category_ids)
            await db.delete(schema.user_permissions).where(eq(schema.user_permissions.user_id, id as string));
            if (Array.isArray(category_ids) && category_ids.length > 0) {
                await db.insert(schema.user_permissions)
                    .values(category_ids.map(catId => ({ user_id: id as string, category_id: Math.min(catId.length, 36) === 36 ? catId : null } as any)).filter((p:any) => p.category_id));
            }

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[USERS API ERROR]:', e);
        return res.status(500).json({ error: 'Internal Server Error', details: (e as Error).message });
    }
}
