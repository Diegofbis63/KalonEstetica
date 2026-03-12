import { getDb } from '../../utils/db.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Security: In a production app, we'd use a secret token for the bridge
    // For now, we'll keep it simple as it's a private bridge
    
    try {
        const db = getDb();
        
        // Find messages where sent_to_whatsapp is false and role is NOT user
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
        console.error('Error fetching pending messages', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
