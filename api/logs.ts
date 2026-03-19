
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'POST') {
        try {
            const { level, message, context, url } = req.body;
            
            await db.insert(schema.system_logs).values({
                level: level || 'error',
                message: message || 'No message',
                context: context || {},
                url: url || null,
                created_at: new Date()
            });

            return res.status(201).json({ success: true });
        } catch (e) {
            console.error('Error saving system log:', e);
            return res.status(500).json({ error: 'Failed' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
