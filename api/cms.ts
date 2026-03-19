
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, desc } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Determine target based on query param or path
    const { type, id, categoryId } = req.query;
    const isService = type === 'service' || req.body?.type === 'service';
    const table = isService ? schema.services : schema.categories;
    const key = isService ? 'services' : 'categories';

    try {
        if (req.method === 'GET') {
            let list;
            if (isService) {
                // Return services filtered by category if requested
                const where = categoryId ? eq(schema.services.category_id, categoryId as string) : undefined;
                list = await db.query.services.findMany({
                    where,
                    orderBy: [desc(schema.services.sort_order), desc(schema.services.created_at)],
                    with: { category: true }
                });
                
                // SANITIZE: duration must be Numeric for Zod
                list = list.map((s: any) => ({
                    ...s,
                    duration: Number(s.duration_min || (s.duration ? parseInt(s.duration) : 0)) || 0,
                    category_name: s.category?.name
                }));
            } else {
                list = await db.query.categories.findMany({
                    orderBy: [desc(schema.categories.sort_order), desc(schema.categories.created_at)]
                });
            }
            
            return res.status(200).json({ [key]: list });
        }

        // AUTH required for mutations
        let user;
        try {
            user = await requireAuth(req, res);
        } catch (e) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!user) return;

        if (req.method === 'POST') {
            const data = req.body.data || req.body;
            // Ensure numeric duration for services
            if (isService && data.duration_min === undefined && data.duration) {
                data.duration_min = parseInt(data.duration) || 0;
            }
            const [item] = await db.insert(table).values(data).returning();
            return res.status(201).json({ [isService ? 'service' : 'category']: item });
        }

        if (req.method === 'PUT') {
            const { id: itemId, ...data } = req.body.data || req.body;
            if (!itemId) return res.status(400).json({ error: 'Missing ID' });
            
            if (isService && data.duration_min === undefined && data.duration) {
                data.duration_min = parseInt(data.duration) || 0;
            }
            const [updated] = await db.update(table).set(data).where(eq(table.id, itemId as string)).returning();
            return res.status(200).json({ [isService ? 'service' : 'category']: updated });
        }

        if (req.method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing ID' });
            await db.delete(table).where(eq(table.id, id as string));
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error(`[CMS API ERROR] ${key}:`, e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
