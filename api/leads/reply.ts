
import { db } from '../_services/db.js';
import * as schema from '../_services/schema.js';
import { requireAuth } from '../../utils/auth.js';
import { eq, and, sql } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        const { leadId, message, mediaUrl, mediaData } = req.body;
        if (!leadId) return res.status(400).json({ error: 'Faltan datos requeridos (leadId)' });

        // 1. Get lead and check permissions
        const lead = await db.query.leads.findFirst({
            where: eq(schema.leads.id, leadId),
            with: { category: true }
        });

        if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

        // RBAC check
        const isAuthorized = user.role === 'admin' || user.permissions?.includes(lead.category?.name);
        if (!isAuthorized) {
            return res.status(403).json({ error: 'No tienes permisos para responder a este prospecto' });
        }

        // 2. Insert into chat_logs
        await db.insert(schema.chat_logs).values({
            lead_id: leadId,
            role: 'admin',
            content: message || '',
            media_url: mediaUrl || null,
            media_data: mediaData || null,
            sent_to_whatsapp: false
        });

        await db.update(schema.leads).set({ updated_at: new Date() }).where(eq(schema.leads.id, leadId));

        return res.status(200).json({ success: true });
    } catch (e) {
        console.error('Error in lead reply:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
