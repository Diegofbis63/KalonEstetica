import { getDb } from '../../utils/db.js';
import { requireAuth } from '../../utils/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const user = await requireAuth(req, res) as { role: string; permissions: string[] };
    if (!user) return;

    try {
        const db = getDb();
        const { leadId, message, mediaUrl } = req.body;

        if (!leadId || (!message && !mediaUrl)) {
            return res.status(400).json({ error: 'Faltan datos requeridos (leadId, message o mediaUrl)' });
        }

        // 1. Get lead and check permissions
        const leadQuery = `
            SELECT l.*, c.name as category_name 
            FROM leads l 
            LEFT JOIN categories c ON l.category_id = c.id 
            WHERE l.id = $1
        `;
        const leadRes = await db.query(leadQuery, [leadId]);

        if (leadRes.rows.length === 0) {
            return res.status(404).json({ error: 'Lead no encontrado' });
        }

        const lead = leadRes.rows[0];

        // RBAC check
        const isAuthorized = user.role === 'admin' || user.permissions?.includes(lead.category_name);
        if (!isAuthorized) {
            return res.status(403).json({ error: 'No tienes permisos para responder a este prospecto' });
        }

        // 2. Prepare new message
        const newMessage = {
            role: 'admin',
            content: message || '',
            media_url: mediaUrl || null,
            created_at: new Date().toISOString()
        };

        // 3. Insert into chat_logs and update leads.updated_at
        await db.query(`
            INSERT INTO chat_logs (lead_id, role, content, media_url, created_at)
            VALUES ($1, $2, $3, $4, $5)
        `, [leadId, newMessage.role, newMessage.content, newMessage.media_url, newMessage.created_at]);

        await db.query(`UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [leadId]);

        return res.status(200).json({ success: true, message: newMessage });
    } catch (e) {
        console.error('Error in lead reply:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
