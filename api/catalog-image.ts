import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, schema } from './_services/db.js';
import { eq } from 'drizzle-orm';

export const config = {
    maxDuration: 15,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const id = (req.query.id || req.body?.id) as string;
        if (!id) {
            return res.status(400).json({ error: 'Missing category id' });
        }

        if (!db) {
            return res.status(500).json({ error: 'Database connection not available' });
        }

        // Fetch category
        const catList = await db.select().from(schema.categories).where(eq(schema.categories.id, id)).limit(1);
        const category = catList[0];

        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Use price_list_url if available, fallback to image_url
        const rawUrl = category.price_list_url || category.image_url;

        if (!rawUrl) {
            return res.status(404).json({ error: 'No catalog image available for this category' });
        }

        // Check if it is a base64 Data URL
        if (rawUrl.startsWith('data:')) {
            const match = rawUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!match) {
                return res.status(400).json({ error: 'Invalid data URL format' });
            }

            const contentType = match[1];
            const base64Data = match[2];
            const buffer = Buffer.from(base64Data, 'base64');

            res.setHeader('Content-Type', contentType);
            // Cache for 24 hours to maximize performance
            res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400');
            return res.status(200).send(buffer);
        } else {
            // It is a standard HTTP/HTTPS URL (e.g. Unsplash), redirect to it
            res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400');
            return res.status(307).redirect(rawUrl);
        }

    } catch (error: any) {
        console.error('[api/catalog-image] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
