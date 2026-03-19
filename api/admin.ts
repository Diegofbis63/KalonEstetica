
import { db, sql } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, and, desc, count, sum } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    // LOGS endpoint - public for reporting, private for viewing
    if (req.url?.includes('logs')) {
      if (req.method === 'POST') {
          const { message, level, context, stack } = req.body;
          await sql`
            INSERT INTO system_logs (message, level, context, stack)
            VALUES (${message}, ${level || 'error'}, ${JSON.stringify(context || {})}, ${stack || null})
          `;
          return res.status(201).json({ success: true });
      }
      
      // GET logs requires auth
      const user = await requireAuth(req, res);
      if (!user) return;
      const logs = await sql`SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 100`;
      return res.status(200).json({ logs });
    }

    // DASHBOARD stats requires auth
    let user;
    try {
        user = await requireAuth(req, res);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!user) return;

    try {
        if (req.method === 'GET') {
            const [metrics] = await sql`SELECT * FROM view_system_metrics`;

            return res.status(200).json({ stats: {
                 totalAppointments: metrics.total_appointments || 0,
                 totalUsers: metrics.total_leads || 0,
                 newToday: metrics.new_today || 0,
                 totalRevenue: metrics.total_revenue || 0
            } });
        }
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[ADMIN API ERROR]:', e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
