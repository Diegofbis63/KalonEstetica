import { getDb } from '../utils/db.js';
import { requireAuth } from '../utils/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const db = getDb();

    // 1. GET - Fetch Categories with Services
    if (req.method === 'GET') {
        try {
            const categoriesRes = await db.query(`
                SELECT * FROM categories 
                WHERE active = true 
                ORDER BY sort_order ASC, created_at ASC
            `);
            return res.status(200).json({ categories: categoriesRes.rows });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Fallo al cargar categorías' });
        }
    }

    // Auth required for mutation
    const user = await requireAuth(req, res);
    if (!user) return;

    // 2. POST - Create Category
    if (req.method === 'POST') {
        const { name, description, image_url, sort_order } = req.body;
        try {
            const resInsert = await db.query(
                'INSERT INTO categories (name, description, image_url, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
                [name, description, image_url, sort_order || 0]
            );
            return res.status(201).json({ category: resInsert.rows[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Error al crear categoría' });
        }
    }

    // 3. PUT - Update Category/Reorder
    if (req.method === 'PUT') {
        const { id, name, description, image_url, sort_order, reorder } = req.body;

        if (reorder && Array.isArray(reorder)) {
            try {
                for (const item of reorder) {
                    await db.query('UPDATE categories SET sort_order = $1 WHERE id = $2', [item.sort_order, item.id]);
                }
                return res.status(200).json({ success: true });
            } catch (e) {
                console.error(e);
                return res.status(500).json({ error: 'Error al reordenar categorías' });
            }
        }

        if (!id) return res.status(400).json({ error: 'Missing ID' });

        try {
            const resUpdate = await db.query(
                'UPDATE categories SET name = $1, description = $2, image_url = $3, sort_order = $4 WHERE id = $5 RETURNING *',
                [name, description, image_url, sort_order, id]
            );
            return res.status(200).json({ category: resUpdate.rows[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Error al actualizar categoría' });
        }
    }

    // 4. DELETE - Delete Category
    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Missing ID' });
        
        try {
            await db.query('DELETE FROM categories WHERE id = $1', [id]);
            return res.status(200).json({ success: true });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Error al eliminar categoría' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
