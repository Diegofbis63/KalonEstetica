
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from './utils/auth.js';
import { eq, asc, and } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. GET - Fetch Categories
    if (req.method === 'GET') {
        const { slug } = req.query;
        try {
            if (slug) {
                const slugValue = Array.isArray(slug) ? slug[0] : slug;
                const result = await db.query.categories.findFirst({
                    where: eq(schema.categories.slug, slugValue)
                });
                return res.status(200).json({ category: result });
            }

            const results = await db.query.categories.findMany({
                where: eq(schema.categories.active, true),
                orderBy: [asc(schema.categories.sort_order), asc(schema.categories.created_at)]
            });

            return res.status(200).json({ categories: results });
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
        const { name, description, image_url, sort_order, slug } = req.body;
        try {
            // Generate slug if not provided
            const finalSlug = slug || name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
            const result = await db.insert(schema.categories).values({
                organization_id: 'kalon-estetica',
                name,
                description,
                image_url,
                sort_order: sort_order || 0,
                slug: finalSlug
            }).returning();
            return res.status(201).json({ category: result[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Error al crear categoría' });
        }
    }

    // 3. PUT - Update Category
    if (req.method === 'PUT') {
        const { id, name, description, image_url, sort_order, reorder, slug } = req.body;

        if (reorder && Array.isArray(reorder)) {
            try {
                for (const item of reorder) {
                    await db.update(schema.categories)
                        .set({ sort_order: item.sort_order })
                        .where(eq(schema.categories.id, item.id));
                }
                return res.status(200).json({ success: true });
            } catch (e) {
                console.error(e);
                return res.status(500).json({ error: 'Error al reordenar categorías' });
            }
        }

        if (!id) return res.status(400).json({ error: 'Missing ID' });

        try {
            const result = await db.update(schema.categories)
                .set({
                    name,
                    description,
                    image_url,
                    sort_order,
                    slug,
                    updated_at: new Date()
                })
                .where(eq(schema.categories.id, id))
                .returning();
            return res.status(200).json({ category: result[0] });
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
            await db.delete(schema.categories).where(eq(schema.categories.id, id as string));
            return res.status(200).json({ success: true });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Error al eliminar categoría' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
