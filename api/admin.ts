
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, and, sql, desc, count, sum } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    // LOGS endpoint - public for reporting, private for viewing
    if (req.url?.includes('logs')) {
      if (req.method === 'POST') {
          const { message, level, context, stack } = req.body;
          const [log] = await db.insert(schema.system_logs).values({
              message,
              level: level || 'error',
              context: JSON.stringify(context || {}),
              stack: stack || null,
          }).returning();
          return res.status(201).json({ success: true, log_id: log.id });
      }
      
      // GET logs requires auth
      const user = await requireAuth(req, res);
      if (!user) return;
      const logs = await db.query.system_logs.findMany({ 
          orderBy: [desc(schema.system_logs.created_at)],
          limit: 100 
      });
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
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const [appointmentsCount] = await db.select({ value: count() }).from(schema.appointments);
            const [usersCount] = await db.select({ value: count() }).from(schema.clients);
            
            // Stats logic here...
            const stats = {
               totalAppointments: appointmentsCount.value || 0,
               totalUsers: usersCount.value || 0,
               newToday: 0 // Fetch more if needed
            };

            return res.status(200).json({ stats });
        }
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[ADMIN API ERROR]:', e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
