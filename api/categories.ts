
// @ts-nocheck
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, asc, and } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';


export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { id, slug, active: activeFilter } = req.query;

    // 1. GET - Fetch Categories (STRICT MODE)
    if (req.method === 'GET') {
        try {
            let categoriesQuery;
            if (id) {
                categoriesQuery = db.select().from(schema.categories).where(eq(schema.categories.id, id as string));
            } else if (slug) {
                categoriesQuery = db.select().from(schema.categories).where(eq(schema.categories.slug, slug as string));
            } else if (activeFilter === 'true') {
                categoriesQuery = db.select().from(schema.categories).where(eq(schema.categories.active, true)).orderBy(asc(schema.categories.sort_order));
            } else {
                categoriesQuery = db.select().from(schema.categories).orderBy(asc(schema.categories.sort_order));
            }

            const categoriesRes = await categoriesQuery;
            
            // Single Item Fetch: Return [item] to match the schema's 'categories' array expectation
            if (id || slug) {
                return res.status(200).json({ 
                    categories: categoriesRes[0] ? [categoriesRes[0]] : [],
                    category: categoriesRes[0] || {} // Keep legacy 'category' for compatibility if needed elsewhere
                });
            }

            // List Fetch: Always return array
            return res.status(200).json({ categories: categoriesRes || [] });
        } catch (e) {
            console.error('[API ERROR] Categories GET:', e);
            // FAIL-SAFE: Empty array
            return res.status(200).json({ categories: [], error_managed: true });
        }
    }

    // AUTH REQUIRED FOR MUTATIONS
    let user;
    try {
        user = await requireAuth(req, res);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!user) return;

    // 2. POST - Create Category
    if (req.method === 'POST') {
        const { name, description, image_url, sort_order, slug, active } = req.body;
        try {
            const finalSlug = slug || name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
            const result = await db.insert(schema.categories).values({
                organization_id: 'kalon-estetica',
                name,
                description,
                image_url,
                sort_order: sort_order || 0,
                slug: finalSlug,
                active: active ?? true
            }).returning();
            return res.status(201).json({ category: result[0] || {} });
        } catch (e) {
            console.error('[API ERROR] Categories POST:', e);
            return res.status(200).json({ category: {}, error: 'Error al crear' });
        }
    }

    // 3. PUT - Update Category
    if (req.method === 'PUT') {
        const { id, name, description, image_url, sort_order, reorder, slug, active } = req.body;

        if (reorder && Array.isArray(reorder)) {
            try {
                for (const item of reorder) {
                    await db.update(schema.categories)
                        .set({ sort_order: item.sort_order })
                        .where(eq(schema.categories.id, item.id));
                }
                return res.status(200).json({ success: true, categories: [] });
            } catch (e) {
                console.error('[API ERROR] Categories REORDER:', e);
                return res.status(200).json({ success: false, categories: [] });
            }
        }

        if (!id) return res.status(200).json({ error: 'Missing ID', category: {} });

        try {
            const updateData: Record<string, unknown> = {
                name,
                description,
                image_url,
                active,
                sort_order,
                slug: slug || name?.toLowerCase().replace(/ /g, '-')
            };
            const result = await db.update(schema.categories)
                .set(updateData)
                .where(eq(schema.categories.id, id as string))
                .returning();
            return res.status(200).json({ category: result[0] || {} });
        } catch (e) {
            console.error('[API ERROR] Categories PUT:', e);
            return res.status(200).json({ category: {}, error: 'Error al actualizar' });
        }
    }

    // 4. DELETE - Delete Category
    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(200).json({ success: false, error: 'Missing ID' });
        
        try {
            await db.delete(schema.categories).where(eq(schema.categories.id, id as string));
            return res.status(200).json({ success: true });
        } catch (e) {
            console.error('[API ERROR] Categories DELETE:', e);
            return res.status(200).json({ success: false, error: 'Error al eliminar' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

