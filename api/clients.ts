
import { db, sql } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, desc } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        if (req.method === 'GET') {
            const clientsRaw = await sql`
                SELECT 
                    l.id,
                    l.client_name,
                    l.contact_info->>'phone' as phone,
                    l.contact_info->>'email' as email,
                    l.contact_info->>'note' as note,
                    l.is_bot_enabled,
                    COUNT(a.id)::int as total_appointments,
                    MAX(a.date_time) as last_appointment
                FROM leads l
                LEFT JOIN appointments a ON l.id = a.lead_id
                GROUP BY l.id
                HAVING COUNT(a.id) > 0
                ORDER BY last_appointment DESC NULLS LAST
            `;

            const mappedClients = await Promise.all(clientsRaw.map(async (c: any) => {
                const history = await db.query.appointments.findMany({
                    where: eq(schema.appointments.lead_id, c.id),
                    orderBy: [desc(schema.appointments.date_time)],
                    limit: 10
                });

                return {
                    id: c.id,
                    client_name: c.client_name || 'Sin Nombre',
                    phone: c.phone || null,
                    email: c.email || null,
                    note: c.note || null,
                    is_bot_enabled: Boolean(c.is_bot_enabled),
                    total_appointments: Number(c.total_appointments) || 0,
                    last_appointment: c.last_appointment ? new Date(c.last_appointment).toISOString() : null,
                    appointment_history: history.map(h => ({
                        id: h.id,
                        date_time: h.date_time.toISOString(),
                        service_type: h.service_type || 'General',
                        status: h.status || 'pending'
                    }))
                };
            }));

            return res.status(200).json({ clients: mappedClients });
        }

        if (req.method === 'PATCH') {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'Missing ID' });
            
            const { client_name, phone, email, note } = req.body;
            
            const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, id as string) });
            if (!lead) return res.status(404).json({ error: 'Lead not found' });

            const contact_info = (lead.contact_info as any) || {};
            if (phone !== undefined) contact_info.phone = phone;
            if (email !== undefined) contact_info.email = email;
            if (note !== undefined) contact_info.note = note;
            
            const [updated] = await db.update(schema.leads)
                .set({ 
                    client_name: client_name || lead.client_name, 
                    contact_info, 
                    updated_at: new Date()
                })
                .where(eq(schema.leads.id, id as string))
                .returning();

            return res.status(200).json({ client: updated });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[CLIENTS API ERROR]:', e);
        return res.status(500).json({ error: 'Internal Server Error', details: (e as Error).message });
    }
}
