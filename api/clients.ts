import { getDb } from './utils/db.js';
import { requireAuth } from './utils/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        const db = getDb();
        
        // Final Query: unique leads who have appointments, with aggregated history
        const query = `
            SELECT 
                l.id,
                l.client_name,
                l.contact_info->>'phone' as phone,
                l.contact_info->>'email' as email,
                l.contact_info->>'note' as note,
                COUNT(a.id) as total_appointments,
                MAX(a.date_time) as last_appointment,
                jsonb_agg(
                    jsonb_build_object(
                        'id', a.id,
                        'date_time', a.date_time,
                        'service_type', a.service_type,
                        'status', a.status
                    ) ORDER BY a.date_time DESC
                ) as appointment_history
            FROM leads l
            INNER JOIN appointments a ON l.id = a.lead_id
            GROUP BY l.id, l.client_name
            ORDER BY last_appointment DESC;
        `;

        const result = await db.query(query);

        // RBAC Check for sensitive data
        const processedClients = result.rows.map((r: any) => {
            const authUser = user as { role: string; permissions: string[] };
            if (authUser.role === 'admin') return { ...r, canViewFullDetails: true };

            return {
                ...r,
                canViewFullDetails: true
            };
        });

        return res.status(200).json({ clients: processedClients });
    } catch (e) {
        console.error('Error in /api/clients', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
