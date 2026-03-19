
// Consolidated CMS API for Categories and Services
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Determine target based on URL or slug
    const isService = req.url?.includes('services') || req.body?.type === 'service';
    const table = isService ? schema.services : schema.categories;
    const key = isService ? 'services' : 'categories';

    try {
        if (req.method === 'GET') {
            const list = await db.query[key].findMany({
                orderBy: [desc(table.created_at)]
            });
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
            const [item] = await db.insert(table).values(req.body.data || req.body).returning();
            return res.status(201).json({ [isService ? 'service' : 'category']: item });
        }

        if (req.method === 'PUT') {
            const { id, ...data } = req.body.data || req.body;
            if (!id) return res.status(400).json({ error: 'Missing ID' });
            const [updated] = await db.update(table).set(data).where(eq(table.id, id)).returning();
            return res.status(200).json({ [isService ? 'service' : 'category']: updated });
        }

        if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'Missing ID' });
            await db.delete(table).where(eq(table.id, id));
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error(`[CMS API ERROR] ${key}:`, e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
