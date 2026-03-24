import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, asc, desc } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    try {
        if (req.method === 'GET') {
            const categories = await db.query.categories.findMany({
                where: eq(schema.categories.active, true),
                orderBy: [asc(schema.categories.sort_order), desc(schema.categories.created_at)]
            });
            return res.status(200).json({ categories });
        }

        // Authentication for mutations
        // Check if requireAuth is in utils
        const user = await requireAuth(req, res);
        if (!user) return;

        if (req.method === 'POST') {
            const data = req.body;
            const [item] = await db.insert(schema.categories).values(data).returning();
            return res.status(201).json({ category: item });
        }

        if (req.method === 'PUT') {
            const body = req.body;
            
            // Handle reorder
            if (body.reorder && Array.isArray(body.reorder)) {
                for (const item of body.reorder) {
                    await db.update(schema.categories).set({ sort_order: item.sort_order }).where(eq(schema.categories.id, item.id));
                }
                return res.status(200).json({ success: true });
            }

            const { id, ...data } = body;
            if (!id) return res.status(400).json({ error: 'Missing ID' });
            
            const [updated] = await db.update(schema.categories).set(data).where(eq(schema.categories.id, id)).returning();
            return res.status(200).json({ category: updated });
        }

        if (req.method === 'DELETE') {
            const id = req.query.id as string;
            if (!id) return res.status(400).json({ error: 'Missing ID' });
            await db.delete(schema.categories).where(eq(schema.categories.id, id));
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[CATEGORIES API ERROR]:', e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

