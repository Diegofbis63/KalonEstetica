import { getDb } from './utils/db.js';
import { requireAuth } from './utils/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const db = getDb();

    // 1. GET - List services with optional category filtering
    if (req.method === 'GET') {
        const { category, category_id, active } = req.query;
        let query = 'SELECT * FROM services';
        const conditions = [];
        const values = [];

        if (active === 'true') {
            conditions.push('active = true');
        }

        if (category_id) {
            values.push(category_id);
            conditions.push(`category_id = $${values.length}`);
        } else if (category) {
            // Legacy support: fetch by category name if category_id isn't provided
            values.push(category);
            conditions.push(`category = $${values.length}`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY sort_order ASC, created_at DESC';

        try {
            const result = await db.query(query, values);
            return res.status(200).json({ services: result.rows });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Failed to fetch services' });
        }
    }

    // Require Auth for Mutations
    const user = requireAuth(req, res);
    if (!user) return;

    // 2. POST - Create service
    if (req.method === 'POST') {
        const { title, description, price, duration, image_url, category_id, sort_order } = req.body;

        try {
            const resInsert = await db.query(
                'INSERT INTO services (title, description, price, duration, image_url, category_id, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
                [title, description, price, duration, image_url, category_id, sort_order || 0]
            );
            return res.status(201).json({ service: resInsert.rows[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Failed to create service' });
        }
    }

    // 3. PUT - Update service / Bulk Reorder
    if (req.method === 'PUT') {
        const { id, title, description, price, duration, image_url, active, category_id, sort_order, reorder } = req.body;

        if (reorder && Array.isArray(reorder)) {
            try {
                for (const item of reorder) {
                    await db.query('UPDATE services SET sort_order = $1 WHERE id = $2', [item.sort_order, item.id]);
                }
                return res.status(200).json({ success: true });
            } catch (e) {
                console.error(e);
                return res.status(500).json({ error: 'Error reordering services' });
            }
        }

        if (!id) return res.status(400).json({ error: 'Missing service ID' });

        try {
            const resUpdate = await db.query(
                `UPDATE services 
                 SET title = $1, description = $2, price = $3, duration = $4, image_url = $5, active = $6, category_id = $7, sort_order = $8 
                 WHERE id = $9 
                 RETURNING *`,
                [title, description, price, duration, image_url, active, category_id, sort_order, id]
            );
            return res.status(200).json({ service: resUpdate.rows[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Failed to update service' });
        }
    }

    // 4. DELETE - Delete service
    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Missing service ID' });

        try {
            await db.query('DELETE FROM services WHERE id = $1', [id]);
            return res.status(200).json({ success: true });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Failed to delete service' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
