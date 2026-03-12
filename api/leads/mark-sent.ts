import { getDb } from '../../utils/db.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: 'Invalid IDs' });
    }

    try {
        const db = getDb();
        await db.query(`
            UPDATE chat_logs 
            SET sent_to_whatsapp = true 
            WHERE id = ANY($1::uuid[])
        `, [ids]);

        return res.status(200).json({ success: true });
    } catch (e) {
        console.error('Error marking messages as sent', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
