import { getDb } from '../../utils/db.js';
import { requireAuth } from '../../utils/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { leadId, action } = req.query;
    const db = getDb();

    // POLLED ACTIONS FOR WHATSAPP BRIDGE (No Auth for internal sync simplified)
    if (req.method === 'GET' && action === 'pending') {
        try {
            const result = await db.query(`
                SELECT cl.id, cl.content, cl.media_url, cl.media_data, l.contact_info->>'phone' as phone
                FROM chat_logs cl
                JOIN leads l ON cl.lead_id = l.id
                WHERE cl.sent_to_whatsapp = false 
                  AND cl.role IN ('admin', 'bot')
                ORDER BY cl.created_at ASC
                LIMIT 5
            `);
            return res.status(200).json({ pending: result.rows });
        } catch (e) {
            return res.status(500).json({ error: 'Sync failed' });
        }
    }

    if (req.method === 'POST' && action === 'mark-sent') {
        try {
            const { ids } = req.body;
            await db.query(`UPDATE chat_logs SET sent_to_whatsapp = true WHERE id = ANY($1::uuid[])`, [ids]);
            return res.status(200).json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: 'Mark failed' });
        }
    }

    // STANDARD CHAT HISTORY (Requires Auth)
    if (req.method === 'GET') {
        if (!leadId) return res.status(400).json({ error: 'Lead ID missing' });
        const user = await requireAuth(req, res);
        if (!user) return;

        try {
            const logsRes = await db.query(`
                SELECT role, content, media_url, media_data, created_at 
                FROM chat_logs 
                WHERE lead_id = $1 
                ORDER BY created_at ASC
            `, [leadId]);
            return res.status(200).json({ history: logsRes.rows });
        } catch (e) {
            return res.status(500).json({ error: 'Fetch failed' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
