
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import bcrypt from 'bcrypt';
import { eq, asc, sql } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';


export default async function handler(req: VercelRequest, res: VercelResponse) {
    let auth;
    try {
        auth = await requireAuth(req, res);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!auth) return;

    if (auth.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado. Solo administradores.', users: [] });

    try {
        if (req.method === 'GET') {
            const users = (await db.query.admin_users.findMany({
                with: {
                    permissions: true
                },
                orderBy: [asc(schema.admin_users.role), asc(schema.admin_users.username)]
            })) || [];

            const processed = users.map(u => ({
                id: u.id,
                username: u.username,
                email: u.email,
                role: u.role,
                password: u.raw_password,
                created_at: u.created_at,
                category_ids: u.permissions.map(p => p.category_id)
            }));

            return res.status(200).json({ users: processed });
        }

        if (req.method === 'PUT') {
            const { id, username, password, category_ids } = req.body;
            if (!id) return res.status(200).json({ error: 'ID requerido', success: false });

            const updateData: any = {};
            if (username) updateData.username = username;
            if (password) {
                updateData.password_hash = await bcrypt.hash(password, 10);
                updateData.raw_password = password;
            }

            if (Object.keys(updateData).length > 0) {
                await db.update(schema.admin_users).set(updateData).where(eq(schema.admin_users.id, id as string));
            }

            if (category_ids && Array.isArray(category_ids)) {
                await (db as any).delete(schema.user_permissions).where(eq(schema.user_permissions.user_id, id as string));
                for (const catId of category_ids) {
                    await (db as any).insert(schema.user_permissions).values({ user_id: id as string, category_id: catId });
                }
            }

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[API ERROR] Users:', e);
        return res.status(200).json({ users: [], error_managed: true });
    }
}

