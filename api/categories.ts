import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { eq, asc } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    try {
        const categories = await db.query.categories.findMany({
            where: eq(schema.categories.active, true),
            orderBy: [asc(schema.categories.sort_order)]
        });
        
        return res.status(200).json({ categories });
    } catch (e) {
        console.error('[CATEGORIES API ERROR]:', e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
