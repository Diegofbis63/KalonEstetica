
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from './utils/auth.js';
import { eq, and, asc } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. GET - Fetch Services
    if (req.method === 'GET') {
        const { category, active, categorySlug, category_id } = req.query;
        
        try {
            let whereClause = undefined;
            
            if (active === 'true') {
                whereClause = eq(schema.services.active, true);
            }

            if (category_id) {
                const idValue = Array.isArray(category_id) ? category_id[0] : category_id;
                const filter = eq(schema.services.category_id, idValue);
                whereClause = whereClause ? and(whereClause, filter) : filter;
            } else if (category) {
                const catValue = Array.isArray(category) ? category[0] : category;
                const filter = eq(schema.services.category, catValue);
                whereClause = whereClause ? and(whereClause, filter) : filter;
            }

            if (categorySlug) {
                const slugValue = Array.isArray(categorySlug) ? categorySlug[0] : categorySlug;
                const catResult = await db.query.categories.findFirst({
                    where: eq(schema.categories.slug, slugValue)
                });
                if (catResult) {
                    const filter = eq(schema.services.category_id, catResult.id);
                    whereClause = whereClause ? and(whereClause, filter) : filter;
                } else {
                    return res.status(200).json({ services: [] });
                }
            }

            const results = await db.query.services.findMany({
                where: whereClause,
                orderBy: [asc(schema.services.sort_order), asc(schema.services.created_at)]
            });

            return res.status(200).json({ services: results });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Fallo al cargar servicios' });
        }
    }

    // Auth required for mutations
    const user = await requireAuth(req, res);
    if (!user) return;

    // 2. POST - Create Service
    if (req.method === 'POST') {
        const data = req.body;
        try {
            // Fetch category name if only ID is provided
            let categoryName = data.category;
            if (data.category_id && !categoryName) {
                const cat = await db.query.categories.findFirst({ where: eq(schema.categories.id, data.category_id) });
                categoryName = cat?.name;
            }

            const result = await db.insert(schema.services).values({
                organization_id: data.organization_id || 'kalon-estetica',
                category_id: data.category_id,
                title: data.title,
                description: data.description,
                price: data.price.toString(),
                duration: data.duration,
                duration_min: data.duration_min || 30,
                category: categoryName,
                image_url: data.image_url,
                sort_order: data.sort_order || 0
            }).returning();
            return res.status(201).json({ service: result[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Error al crear servicio' });
        }
    }

    // 3. PUT - Update Service
    if (req.method === 'PUT') {
        const { id, reorder, ...data } = req.body;

        if (reorder && Array.isArray(reorder)) {
            try {
                for (const item of reorder) {
                    await db.update(schema.services)
                        .set({ sort_order: item.sort_order })
                        .where(eq(schema.services.id, item.id));
                }
                return res.status(200).json({ success: true });
            } catch (e) {
                console.error(e);
                return res.status(500).json({ error: 'Error al reordenar servicios' });
            }
        }

        if (!id) return res.status(400).json({ error: 'Missing ID' });

        try {
            const result = await db.update(schema.services)
                .set({
                    ...data,
                    price: data.price?.toString(),
                    updated_at: new Date()
                })
                .where(eq(schema.services.id, id))
                .returning();
            return res.status(200).json({ service: result[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Error al actualizar servicio' });
        }
    }

    // 4. DELETE - Delete Service
    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Missing ID' });

        try {
            await db.delete(schema.services).where(eq(schema.services.id, id as string));
            return res.status(200).json({ success: true });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Error al eliminar servicio' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
