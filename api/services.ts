
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, and, asc } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { id, category_id, categorySlug } = req.query;

    // 1. GET - Fetch Services
    if (req.method === 'GET') {
        try {
            let servicesQuery;
            if (categorySlug) {
                // Fetch category by slug first
                const cat = await db.query.categories.findFirst({
                    where: eq(schema.categories.slug, categorySlug as string)
                });
                if (!cat) return res.status(200).json({ services: [] });
                
                servicesQuery = db.select().from(schema.services)
                    .where(eq(schema.services.category_id, cat.id))
                    .orderBy(asc(schema.services.sort_order));
            } else if (category_id) {
                servicesQuery = db.select().from(schema.services)
                    .where(eq(schema.services.category_id, category_id as string))
                    .orderBy(asc(schema.services.sort_order));
            } else {
                servicesQuery = db.select().from(schema.services)
                    .orderBy(asc(schema.services.sort_order));
            }

            const services = await servicesQuery;
            return res.status(200).json({ services });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Error al obtener servicios' });
        }
    }

    // AUTH REQUIRED FOR MUTATIONS
    const user = await requireAuth(req, res);
    if (!user) return;

    // 2. POST - Create Service
    if (req.method === 'POST') {
        const data = req.body;
        try {
            const result = await db.insert(schema.services).values({
                category_id: data.category_id,
                title: data.title,
                description: data.description,
                price: data.price?.toString(),
                duration: data.duration,
                duration_min: data.duration_min || 0,
                category: data.category, 
                image_url: data.image_url,
                active: data.active ?? true,
                sort_order: data.sort_order || 0
            }).returning();
            return res.status(201).json({ service: result[0] });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Error al crear servicio' });
        }
    }

    // 3. PUT - Update or Reorder
    if (req.method === 'PUT') {
        const { reorder, data } = req.body;
        const { id } = req.query;

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
                    category_id: data.category_id,
                    title: data.title,
                    description: data.description,
                    price: data.price?.toString(),
                    duration: data.duration,
                    duration_min: data.duration_min,
                    image_url: data.image_url,
                    active: data.active,
                    sort_order: data.sort_order
                })
                .where(eq(schema.services.id, id as string))
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
