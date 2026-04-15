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
    
    const { section, limit: qLimit, offset: qOffset } = req.query;
    const limit = Math.min(Number(qLimit || 50), 100);
    const offset = Number(qOffset || 0);
    const sec = section as string;

    try {
        // --- AUTH REQUIRED ---
        const user = await requireAuth(req, res);
        if (!user) return;

        // --- CLIENTS MANAGEMENT ---
        if (sec === 'clients') {
            if (req.method === 'GET') {
                const [totalCount] = await db.select({ count: sql`count(*)` }).from(schema.leads);
                // We perform a join to get appointment stats, required by the frontend ClientSchema
                const results = await db.select({
                    id: schema.leads.id,
                    name: sql<string>`COALESCE(${schema.leads.client_name}, 'Cliente')`,
                    phone: sql<string>`COALESCE(${schema.leads.phone}, '')`,
                    status: sql<string>`COALESCE(${schema.leads.status}, 'active')`,
                    created_at: schema.leads.created_at,
                    total_appointments: sql<number>`COUNT(${schema.appointments.id})::int`,
                    total_spent: sql<number>`SUM(COALESCE(${schema.appointments.total_price}, 0))::float`,
                    last_interaction: sql<string | null>`MAX(${schema.appointments.date_time})`
                })
                .from(schema.leads)
                .leftJoin(schema.appointments, eq(schema.leads.id, schema.appointments.lead_id))
                .leftJoin(schema.categories, eq(schema.leads.category_id, schema.categories.id))
                .groupBy(
                    schema.leads.id, 
                    schema.leads.client_name, 
                    schema.leads.phone, 
                    schema.leads.status, 
                    schema.leads.created_at
                )
                .orderBy(desc(schema.leads.created_at))
                .limit(limit)
                .offset(offset);

                const count = Number(totalCount?.count || 0);
                // Safe date formatter for client data
                const safeISO = (dateStr: string | Date | null | undefined) => {
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
                const clients = results.map((c: Record<string, unknown>) => ({
                    id: c.id,
                    client_name: c.name || 'Cliente',
                    phone: c.phone || '',
                    email: null, 
                    status: c.status || 'active',
                    created_at: safeISO(c.created_at) || new Date().toISOString(),
                    last_interaction: safeISO(c.last_interaction),
                    last_appointment: safeISO(c.last_interaction) || new Date().toISOString(),
                    total_appointments: c.total_appointments || 0,
                    total_spent: c.total_spent || 0,
                    note: ''
                }));

                return res.status(200).json({ 
                    clients,
                    metadata: {
                        total: count,
                        limit,
                        offset,
                        hasMore: offset + limit < count
                    }
                });
            }
            if (req.method === 'POST') {
                const { client_name, name, ...rest } = req.body as { client_name?: string, name?: string };
                const finalName = client_name || name;
                const [item] = await db.insert(schema.leads).values({ ...rest, client_name: finalName }).returning();
                return res.status(201).json({ client: item });
            }
            if (req.method === 'PUT' || req.method === 'PATCH') {
                const id = req.query.id as string;
                const { client_name, name, ...rest } = req.body as { client_name?: string, name?: string, phone?: string, status?: string };
                const finalName = client_name || name;
                const updateData: Record<string, string | number | boolean | null | Date> = { ...rest };
                if (finalName) updateData.client_name = finalName;
                
                const [updated] = await db.update(schema.leads).set(updateData).where(eq(schema.leads.id, id)).returning();
                return res.status(200).json({ client: updated });
            }
        }

        // --- LEADS TRACKING / IDENTIFY ---
        if (sec === 'tracking' || sec === 'identify' || sec === 'leads') {
            if (req.method === 'GET') {
                const results = await db.select({
                    id: schema.leads.id,
                    client_name: sql<string>`COALESCE(${schema.leads.client_name}, 'Cliente')`,
                    phone: sql<string>`COALESCE(${schema.leads.phone}, '')`,
                    status: sql<string>`COALESCE(${schema.leads.status}, 'new')`,
                    intent_score: sql<number>`COALESCE(${schema.leads.intent_score}, 0)`,
                    category_id: schema.leads.category_id,
                    category_name: sql<string>`COALESCE(${schema.categories.name}, 'General')`,
                    created_at: schema.leads.created_at,
                    updated_at: schema.leads.updated_at,
                    is_bot_enabled: sql<boolean>`COALESCE(${schema.leads.is_bot_enabled}, true)`
                })
                .from(schema.leads)
                .leftJoin(schema.categories, eq(schema.leads.category_id, schema.categories.id))
                .orderBy(desc(schema.leads.last_interaction));

                const leads = results.map((l: {
                    id: string,
                    client_name: string,
                    phone: string,
                    status: string,
                    intent_score: number,
                    category_id: string | null,
                    category_name: string | null,
                    created_at: string | Date | null,
                    updated_at: string | Date | null,
                    is_bot_enabled: boolean | null
                }) => ({
                    ...l,
                    email: null, // Lead table doesn't have email column
                    created_at: l.created_at ? new Date(l.created_at).toISOString() : new Date().toISOString(),
                    updated_at: l.updated_at ? new Date(l.updated_at).toISOString() : null,
                    canManage: true
                }));

                return res.status(200).json({ leads });
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
    } catch (e: unknown) {
        console.error('[ADMIN API ERROR] ', e);
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        return res.status(500).json({ error: 'Internal Server Error', details: errorMessage });
    }
}
