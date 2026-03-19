
import { db, sql } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, and, desc, count, sql as drizzleSql } from 'drizzle-orm';
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

    // 2. DASHBOARD / METRICS Handling
    let user;
    try {
        user = await requireAuth(req, res);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!user) return;

    try {
        if (req.method === 'GET') {
            const { date } = req.query; // Timeline date support
            
            // Stats from View (High Performance)
            const [metrics] = await sql`SELECT * FROM view_system_metrics`;

            // Filter for Dashboard Tables
            const timeframe = date ? drizzleSql`DATE(${schema.appointments.date_time}) = ${date}` : undefined;

            // Fetch Recent Appointments (Correct structure for Dashboard.tsx)
            const appointments = await db.query.appointments.findMany({
                where: timeframe,
                orderBy: [desc(schema.appointments.date_time)],
                limit: 20,
                with: { lead: true, category: true }
            });

            // Fetch Recent Leads
            const leads = await db.query.leads.findMany({
                orderBy: [desc(schema.leads.updated_at)],
                limit: 10
            });

            return res.status(200).json({ 
                stats: {
                     totalAppointments: metrics?.total_appointments || 0,
                     totalUsers: metrics?.total_leads || 0,
                     newToday: metrics?.new_today || 0,
                     totalRevenue: metrics?.total_revenue || 0
                },
                appointments: appointments.map(a => ({
                    ...a,
                    client_name: a.lead?.client_name,
                    phone: a.lead?.contact_info?.phone,
                    category_name: a.category?.name
                })),
                leads: leads.map(l => ({
                   ...l,
                   phone: l.contact_info?.phone
                }))
            });
        }
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[ADMIN API ERROR]:', e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
