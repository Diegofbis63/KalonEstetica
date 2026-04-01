import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, desc, and } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * N├ÜCLEO MAESTRO DE LEADS Y CLIENTES K├éLON (v14)
 * Consolida: Clients, Lead Identify, Lead Chat / Tracking.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const { section } = req.query;
    const sec = section as string;

    try {
        // --- AUTH REQUIRED ---
        const user = await requireAuth(req, res);
        if (!user) return;

        // --- CLIENTS MANAGEMENT ---
        if (sec === 'clients') {
            if (req.method === 'GET') {
                const results = await db.query.clients.findMany({ orderBy: [desc(schema.clients.created_at)] });
                return res.status(200).json({ clients: results });
            }
            if (req.method === 'POST') {
                const [item] = await db.insert(schema.clients).values(req.body).returning();
                return res.status(201).json({ client: item });
            }
            if (req.method === 'PUT' || req.method === 'PATCH') {
                const id = req.query.id as string;
                const [updated] = await db.update(schema.clients).set(req.body).where(eq(schema.clients.id, id)).returning();
                return res.status(200).json({ client: updated });
            }
        }

        // --- LEADS TRACKING / IDENTIFY ---
        if (sec === 'tracking' || sec === 'identify' || sec === 'leads') {
            if (req.method === 'GET') {
                const results = await db.query.leads.findMany({ orderBy: [desc(schema.leads.last_interaction)] });
                return res.status(200).json({ leads: results });
            }
            if (req.method === 'POST') {
                const { phone, name, status } = req.body;
                const [lead] = await db.insert(schema.leads).values({ phone, name, status: status || 'new' }).onConflictDoUpdate({
                    target: schema.leads.phone,
                    set: { last_interaction: new Date() }
                }).returning();
                return res.status(201).json({ lead });
            }
        }

        return res.status(405).json({ error: 'Method not allowed or Section missing' });
    } catch (e) {
        console.error(`[LEADS API ERROR] ${sec}:`, e);
        return res.status(500).json({ error: 'Internal Server Error', details: (e as Error).message });
    }
}
