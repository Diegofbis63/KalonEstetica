import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, desc, asc, sql as drizzleSql } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, id, categoryId, category_id, categorySlug, slug } = req.query;
    const catId = (categoryId || category_id) as string;
    const catSlug = categorySlug as string;
    const itemSlug = slug as string;
    
    const fullUrl = (req.url || '').toLowerCase();
    const isService = fullUrl.includes('service') || type === 'service' || (req.body && req.body.type === 'service');
    
    const table = isService ? schema.services : schema.categories;
    const key = isService ? 'services' : 'categories';

    try {
        if (req.method === 'GET') {
            let list;
            if (isService) {
                let targetId = catId;
                if (!targetId && catSlug) {
                    const cat = await db.query.categories.findFirst({
                        where: eq(schema.categories.slug, catSlug)
                    });
                    if (cat) targetId = cat.id;
                }
                
                const where = targetId ? eq(schema.services.category_id, targetId) : undefined;
                
                list = await db.query.services.findMany({
                    where,
                    orderBy: [asc(schema.services.sort_order), desc(schema.services.created_at)],
                    with: { category: true }
                });
                
                list = list.map((s: any) => {
                    const cleanDur = parseInt(String(s.duration_min || s.duration || "0")) || 0;
                    return {
                        ...s,
                        duration: isNaN(cleanDur) ? 0 : cleanDur,
                        price: Number(s.price || 0) || 0,
                        category_name: s.category?.name
                    };
                });
            } else {
                const where = itemSlug ? eq(schema.categories.slug, itemSlug) : undefined;
                list = await db.query.categories.findMany({
                    where,
                    orderBy: [asc(schema.categories.sort_order), desc(schema.categories.created_at)]
                });
            }
            
            return res.status(200).json({ [key]: list });
        }

        const user = await requireAuth(req, res);
        if (!user) return;

        if (req.method === 'POST') {
            const data = req.body.data || req.body;
            if (isService && data.duration) data.duration_min = parseInt(String(data.duration)) || 0;
            const [item] = await db.insert(table).values(data).returning();
            return res.status(201).json({ [isService ? 'service' : 'category']: item });
        }

        if (req.method === 'PUT') {
            const body = req.body.data || req.body;
            if (body.reorder && Array.isArray(body.reorder)) {
                for (const item of body.reorder) {
                    await db.update(table).set({ sort_order: item.sort_order }).where(eq(table.id, item.id));
                }
                return res.status(200).json({ success: true, message: 'Orden actualizado' });
            }
            const { id: itemId, ...data } = body;
            if (!itemId) return res.status(400).json({ error: 'Missing ID' });
            if (isService && data.duration) data.duration_min = parseInt(String(data.duration)) || 0;
            const [updated] = await db.update(table).set(data).where(eq(table.id, itemId as string)).returning();
            return res.status(200).json({ [isService ? 'service' : 'category']: updated });
        }

        if (req.method === 'DELETE') {
            const deleteId = (id || req.body.id || req.query.id) as string;
            if (!deleteId) return res.status(400).json({ error: 'Missing ID' });
            await db.delete(table).where(eq(table.id, deleteId));
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error(`[CMS API ERROR] ${key}:`, e);
        return res.status(500).json({ error: 'Internal Server Error', details: (e as Error).message });
    }
}
