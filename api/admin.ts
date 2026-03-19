
import { db, sql } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, and, desc, sql as drizzleSql } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. LOGS Handling (Public for POST, Auth for GET)
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

    // Auth is mandatory for Dashboard
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        if (req.method === 'GET') {
            const { date } = req.query; 
            
            // 1. Get Metrics (Casting to Numbers)
            const [metrics] = await sql`SELECT * FROM view_system_metrics`;

            // 2. Fetch DATA (Appointments & Leads)
            // Use AT TIME ZONE for reliable date filtering in Argentina
            const timeframe = date ? drizzleSql`(${schema.appointments.date_time} AT TIME ZONE 'America/Argentina/Cordoba')::date = ${date}` : undefined;

            // Increase limit significantly to avoid UI counting errors
            const appointments = await db.query.appointments.findMany({
                where: timeframe,
                orderBy: [desc(schema.appointments.date_time)],
                limit: 200, 
                with: { lead: true, category: true }
            });

            const leads = await db.query.leads.findMany({
                orderBy: [desc(schema.leads.updated_at)],
                limit: 100
            });

            // 3. Map for Frontend (Align with Naming Dictionary and UI Expectations)
            const mappedAppointments = appointments.map(a => {
                const lead = a.lead || {};
                const contactInfo = lead.contact_info || {};
                return {
                    ...a,
                    client_name: lead.client_name || 'Sin Nombre',
                    phone: contactInfo.phone || null,
                    category_name: a.category?.name || a.service_type || 'Servicio',
                    is_bot_enabled: lead.is_bot_enabled ?? true,
                    // Extra properties required by some UI parts
                    created_at: a.created_at?.toISOString(),
                    date_time: a.date_time?.toISOString(),
                    total_price: a.total_price ? Number(a.total_price) : 0,
                    total_duration: a.total_duration ? Number(a.total_duration) : 0
                };
            });

            const mappedLeads = leads.map(l => {
                const contactInfo = l.contact_info || {};
                return {
                    ...l,
                    phone: contactInfo.phone || null,
                    category_name: l.category_id ? 'Tiene interés' : 'Interés General',
                    is_bot_enabled: l.is_bot_enabled ?? true,
                    created_at: l.created_at?.toISOString(),
                    updated_at: l.updated_at?.toISOString(),
                    intent_score: Number(l.intent_score || 0)
                };
            });

            return res.status(200).json({ 
                stats: {
                     totalAppointments: Number(metrics?.total_appointments || 0),
                     totalUsers: Number(metrics?.total_leads || 0),
                     newToday: Number(metrics?.new_today || 0),
                     total_revenue: Number(metrics?.total_revenue || 0)
                },
                appointments: mappedAppointments,
                leads: mappedLeads
            });
        }
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[ADMIN DASHBOARD ERROR]:', e);
        // Ensure we don't return 500 which is swallowed by safeFetch
        return res.status(200).json({ 
            leads: [], 
            appointments: [], 
            stats: { totalAppointments: 0, totalUsers: 0, newToday: 0, total_revenue: 0 },
            error_details: (e as Error).message 
        });
    }
}
