
import { db, sql } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, and, desc, sql as drizzleSql } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. LOGS Handling
    if (req.url?.includes('logs')) {
      if (req.method === 'POST') {
          const { message, level, context, stack } = req.body;
          await sql`
            INSERT INTO system_logs (message, level, context, stack)
            VALUES (${message}, ${level || 'error'}, ${JSON.stringify(context || {})}, ${stack || null})
          `;
          return res.status(201).json({ success: true });
      }
      const user = await requireAuth(req, res);
      if (!user) return;
      const logs = await sql`SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 100`;
      return res.status(200).json({ logs });
    }

    // Auth is mandatory
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        if (req.method === 'GET') {
            const { date } = req.query; 
            
            // 1. Get Metrics (Casting to Numbers)
            const metrics: any = (await sql`SELECT * FROM view_system_metrics`)[0] || {};

            // 2. Fetch DATA
            const timeframe = date ? drizzleSql`(${schema.appointments.date_time} AT TIME ZONE 'America/Argentina/Cordoba')::date = ${date}` : undefined;

            const appointments = (await db.query.appointments.findMany({
                where: timeframe,
                orderBy: [desc(schema.appointments.date_time)],
                limit: 200, 
                with: { lead: true, category: true }
            })) as any[];

            const leads = (await db.query.leads.findMany({
                orderBy: [desc(schema.leads.updated_at)],
                limit: 100
            })) as any[];

            // 3. Map for Frontend (Hard fallbacks for Zod)
            const mappedAppointments = appointments.map(a => {
                const lead = a.lead || {};
                const contactInfo = lead.contact_info || {};
                
                let services = Array.isArray(a.selected_services) ? a.selected_services : [];
                services = services.map((s: any) => {
                    if (!s) return null;
                    const rawDur = s.duration || s.duration_min || "0";
                    const cleanDur = parseInt(String(rawDur)) || 0;
                    const cleanPrice = Number(s.price || 0) || 0;
                    return {
                        id: s.id || crypto.randomUUID(),
                        title: s.title || (s.name || 'Servicio'),
                        duration: isNaN(cleanDur) ? 0 : cleanDur,
                        price: isNaN(cleanPrice) ? 0 : cleanPrice
                    };
                }).filter(Boolean);

                return {
                    id: a.id,
                    lead_id: a.lead_id || null,
                    client_name: lead.client_name || 'Sin Nombre',
                    phone: contactInfo.phone || null,
                    service_type: a.service_type || 'General',
                    category_name: a.category?.name || a.service_type || 'Servicio',
                    category_id: a.category_id || null,
                    date_time: a.date_time?.toISOString ? a.date_time.toISOString() : new Date().toISOString(),
                    status: a.status || 'pending',
                    created_at: a.created_at?.toISOString ? a.created_at.toISOString() : new Date().toISOString(),
                    total_price: Number(a.total_price) || 0,
                    total_duration: parseInt(String(a.total_duration || "0")) || 0,
                    selected_services: services,
                    canManage: true,
                    is_bot_enabled: lead.is_bot_enabled ?? true
                };
            });

            const mappedLeads = leads.map(l => {
                const contactInfo = l.contact_info || {};
                return {
                    id: l.id,
                    client_name: l.client_name || 'Interés Nuevo',
                    phone: contactInfo.phone || null,
                    status: l.status || 'draft',
                    intent_score: Number(l.intent_score) || 0,
                    category_id: l.category_id || null,
                    category_name: l.category_id ? 'Tiene interés' : 'Interés General',
                    is_bot_enabled: l.is_bot_enabled ?? true,
                    canManage: true,
                    created_at: l.created_at?.toISOString ? l.created_at.toISOString() : new Date().toISOString(),
                    updated_at: l.updated_at?.toISOString ? l.updated_at.toISOString() : null
                };
            });

            return res.status(200).json({ 
                stats: {
                     totalAppointments: Number(metrics.total_appointments) || 0,
                     totalUsers: Number(metrics.total_leads) || 0,
                     newToday: Number(metrics.new_today) || 0,
                     total_revenue: Number(metrics.total_revenue) || 0
                },
                appointments: mappedAppointments,
                leads: mappedLeads
            });
        }
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[ADMIN DASHBOARD ERROR]:', e);
        return res.status(200).json({ 
            leads: [], 
            appointments: [], 
            stats: { totalAppointments: 0, totalUsers: 0, newToday: 0, total_revenue: 0 },
            error: (e as Error).message,
            stack: (e as Error).stack,
            debug_info: {
                has_db: !!db,
                has_schema_appointments: !!schema.appointments,
                has_schema_leads: !!schema.leads
            }
        });
    }
}
