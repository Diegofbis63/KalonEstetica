import { getDb } from './utils/db.js';
import { requireAuth } from './utils/auth.js';
import bcrypt from 'bcrypt';
import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const { role } = auth as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Solo administradores.' });
    }

    const db = getDb();

    if (req.method === 'GET') {
      const result = await db.query(`
        SELECT id, username, email, role, raw_password as password, created_at FROM admin_users ORDER BY role ASC, username ASC
      `);

      const users = await Promise.all(result.rows.map(async (u: any) => {
        const perms = await db.query('SELECT category_id FROM user_permissions WHERE user_id = $1', [u.id]);
        return {
          ...u,
          category_ids: perms.rows.map((r: any) => r.category_id)
        };
      }));

      return res.status(200).json({ users });
    }

    if (req.method === 'PUT') {
      const { id, username, password, category_ids } = req.body;
      if (!id) return res.status(400).json({ error: 'ID requerido' });

      const updates = [];
      const params = [];
      let i = 1;

      if (username) {
        updates.push(`username = $${i++}`);
        params.push(username);
      }
      if (password) {
        const hash = await bcrypt.hash(password, 10);
        updates.push(`password_hash = $${i++}`);
        params.push(hash);
        updates.push(`raw_password = $${i++}`);
        params.push(password);
      }

      if (updates.length > 0) {
        params.push(id);
        await db.query(`
          UPDATE admin_users SET ${updates.join(', ')} WHERE id = $${i}
        `, params);
      }

      // Update permissions
      if (category_ids && Array.isArray(category_ids)) {
        await db.query('DELETE FROM user_permissions WHERE user_id = $1', [id]);
        for (const catId of category_ids) {
          await db.query('INSERT INTO user_permissions (user_id, category_id) VALUES ($1, $2)', [id, catId]);
        }
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Users API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
