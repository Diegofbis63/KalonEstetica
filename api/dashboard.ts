import { getDb } from './utils/db.js';
import { requireAuth } from './utils/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const user = requireAuth(req, res);
    if (!user) return;

    try {
        const db = getDb();

        // Fetch leads
        const leadsRes = await db.query(`
      SELECT * FROM leads ORDER BY created_at DESC LIMIT 50
    `);

        // Fetch appointments with lead info
        const apptsRes = await db.query(`
      SELECT a.*, l.client_name, l.contact_info->>'phone' as phone, l.contact_info->>'email' as email 
      FROM appointments a 
      LEFT JOIN leads l ON a.lead_id = l.id 
      ORDER BY a.date_time DESC 
      LIMIT 50
    `);

        return res.status(200).json({
            leads: leadsRes.rows,
            appointments: apptsRes.rows
        });
    } catch (e) {
        console.error('Error fetching dashboard data', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
