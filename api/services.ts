import { getDb } from './utils/db.js';
import { requireAuth } from './utils/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const db = getDb();

    // Public GET route to fetch active services (no auth required)
    if (req.method === 'GET') {
        try {
            const activeOnly = req.query.active === 'true';
            const q = activeOnly
                ? 'SELECT * FROM services WHERE active = true ORDER BY sort_order ASC, created_at ASC'
                : 'SELECT * FROM services ORDER BY sort_order ASC, created_at ASC';
            const result = await db.query(q);
            return res.status(200).json({ services: result.rows });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // All other routes require auth
    const user = requireAuth(req, res);
    if (!user) return;

    if (req.method === 'POST') {
        const { title, description, price, duration, image_url, active } = req.body;
        try {
            // Get current max sort_order
            const maxOrderRes = await db.query('SELECT COALESCE(MAX(sort_order), 0) as max_order FROM services');
            const newOrder = (maxOrderRes.rows[0].max_order || 0) + 1;

            const result = await db.query(
                'INSERT INTO services (title, description, price, duration, image_url, active, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
                [title, description, price, duration, image_url, active ?? true, newOrder]
            );
            return res.status(201).json({ service: result.rows[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    if (req.method === 'PUT') {
        const { id, title, description, price, duration, image_url, active, sort_order, reorder } = req.body;

        // Handle bulk reorder
        if (reorder && Array.isArray(reorder)) {
            try {
                for (const item of reorder) {
                    await db.query('UPDATE services SET sort_order = $1 WHERE id = $2', [item.sort_order, item.id]);
                }
                return res.status(200).json({ success: true });
            } catch (e) {
                console.error(e);
                return res.status(500).json({ error: 'Failed to reorder' });
            }
        }

        if (!id) return res.status(400).json({ error: 'Missing ID' });

        try {
            const result = await db.query(
                'UPDATE services SET title = $1, description = $2, price = $3, duration = $4, image_url = $5, active = $6, sort_order = COALESCE($7, sort_order) WHERE id = $8 RETURNING *',
                [title, description, price, duration, image_url, active, sort_order, id]
            );
            return res.status(200).json({ service: result.rows[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    if (req.method === 'DELETE') {
        const id = req.query.id;
        if (!id) return res.status(400).json({ error: 'Missing ID' });

        try {
            await db.query('DELETE FROM services WHERE id = $1', [id]);
            return res.status(200).json({ success: true });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
