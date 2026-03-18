
import { db } from '../_services/db.js';
import * as schema from '../_services/schema.js';
import { requireAuth } from '../../utils/auth.js';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { leadId, action } = req.query;

    // 1. POLLED ACTIONS FOR WHATSAPP BRIDGE (No Auth)
    if (req.method === 'GET' && action === 'pending') {
        try {
            const pending = await db.select({
                id: schema.chat_logs.id,
                content: schema.chat_logs.content,
                media_url: schema.chat_logs.media_url,
                media_data: schema.chat_logs.media_data,
                phone: sql<string>`${schema.leads.contact_info}->>'phone'`
            })
            .from(schema.chat_logs)
            .innerJoin(schema.leads, eq(schema.chat_logs.lead_id, schema.leads.id))
            .where(and(
                eq(schema.chat_logs.sent_to_whatsapp, false),
                sql`${schema.chat_logs.role} IN ('admin', 'bot')`
            ))
            .orderBy(asc(schema.chat_logs.created_at))
            .limit(5);

            return res.status(200).json({ pending });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Sync failed' });
        }
    }

    if (req.method === 'POST' && action === 'mark-sent') {
        try {
            const { ids } = req.body;
            if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Missing IDs' });
            
            for (const id of ids) {
                await db.update(schema.chat_logs).set({ sent_to_whatsapp: true }).where(eq(schema.chat_logs.id, id));
            }
            return res.status(200).json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: 'Mark failed' });
        }
    }

    // 2. AUTHENTICATED ACTIONS (Require Auth)
    const user = await requireAuth(req, res);
    if (!user) return;

    if (req.method === 'POST' && action === 'toggle-bot') {
        try {
            const { isBotEnabled } = req.body;
            await db.update(schema.leads).set({ is_bot_enabled: isBotEnabled }).where(eq(schema.leads.id, leadId as string));
            return res.status(200).json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: 'Toggle failed' });
        }
    }

    if (req.method === 'DELETE') {
        try {
            if (!leadId) return res.status(400).json({ error: 'Missing lead ID' });
            await db.delete(schema.appointments).where(eq(schema.appointments.lead_id, leadId as string));
            await db.delete(schema.leads).where(eq(schema.leads.id, leadId as string));
            return res.status(200).json({ message: 'Lead deleted' });
        } catch (e) {
            return res.status(500).json({ error: 'Delete failed' });
        }
    }

    if (req.method === 'GET') {
        if (!leadId) return res.status(400).json({ error: 'Lead ID missing' });
        try {
            const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId as string) });
            const logs = await db.query.chat_logs.findMany({
                where: eq(schema.chat_logs.lead_id, leadId as string),
                orderBy: [asc(schema.chat_logs.created_at)]
            });
            return res.status(200).json({ 
                history: logs,
                is_bot_enabled: lead?.is_bot_enabled 
            });
        } catch (e) {
            return res.status(500).json({ error: 'Fetch failed' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
