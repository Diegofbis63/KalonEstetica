import { getDb } from '../../utils/db.js';
import { requireAuth } from '../../utils/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { leadId } = req.query;
    if (!leadId) {
        return res.status(400).json({ error: 'Lead ID missing' });
    }

    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        const db = getDb();
        
        const logsRes = await db.query(`
            SELECT role, content, media_url, created_at 
            FROM chat_logs 
            WHERE lead_id = $1 
            ORDER BY created_at ASC
        `, [leadId]);

        return res.status(200).json({ history: logsRes.rows });
    } catch (e) {
        console.error('Error fetching chat logs', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
