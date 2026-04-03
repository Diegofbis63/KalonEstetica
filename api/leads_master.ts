import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * NÚCLEO MAESTRO DE LEADS Y CLIENTES KÂLON (v14)
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
                // We perform a join to get appointment stats, required by the frontend ClientSchema
                const results = await db.select({
                    id: schema.leads.id,
                    client_name: schema.leads.client_name,
                    phone: schema.leads.phone,
                    status: schema.leads.status,
                    intent_score: schema.leads.intent_score,
                    category_id: schema.leads.category_id,
                    category_name: schema.categories.name,
                    is_bot_enabled: schema.leads.is_bot_enabled,
                    created_at: schema.leads.created_at,
                    total_appointments: sql<number>`count(${schema.appointments.id})::int`,
                    last_appointment: sql<string | null>`max(${schema.appointments.date_time})`
                })
                .from(schema.leads)
                .leftJoin(schema.appointments, eq(schema.leads.id, schema.appointments.lead_id))
                .leftJoin(schema.categories, eq(schema.leads.category_id, schema.categories.id))
                .groupBy(
                    schema.leads.id, 
                    schema.leads.client_name, 
                    schema.leads.phone, 
                    schema.leads.status, 
                    schema.leads.intent_score,
                    schema.leads.category_id,
                    schema.categories.name,
                    schema.leads.is_bot_enabled, 
                    schema.leads.created_at
                )
                .orderBy(desc(schema.leads.created_at));

                // Safe date formatter for client data
                const safeISO = (dateStr: any) => {
                    if (!dateStr) return null;
                    try {
                        const date = new Date(dateStr);
                        if (isNaN(date.getTime())) return null;
                        return date.toISOString();
                    } catch (err) {
                        return null;
                    }
                };

                // Formatear para satisfacer ClientSchema (validations.ts)
                const clients = results.map(c => ({
                    ...c,
                    created_at: safeISO(c.created_at) || new Date().toISOString(),
                    last_appointment: safeISO(c.last_appointment),
                    email: null,
                    note: null,
                    category_name: c.category_name || 'Sin Categoría',
                    appointment_history: []
                }));

                return res.status(200).json({ clients });
            }
            if (req.method === 'POST') {
                const { client_name, name, ...rest } = req.body as { client_name?: string, name?: string };
                const finalName = client_name || name;
                const [item] = await db.insert(schema.leads).values({ ...rest, client_name: finalName }).returning();
                return res.status(201).json({ client: item });
            }
            if (req.method === 'PUT' || req.method === 'PATCH') {
                const id = req.query.id as string;
                const { client_name, name, ...rest } = req.body as { client_name?: string, name?: string };
                const finalName = client_name || name;
                const updateData: Record<string, any> = { ...rest };
                if (finalName) updateData.client_name = finalName;
                
                const [updated] = await db.update(schema.leads).set(updateData).where(eq(schema.leads.id, id)).returning();
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
