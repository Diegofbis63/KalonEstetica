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
        const { date } = req.query; // For daily timeline filtering

        interface LeadRow {
            category_name: string;
            phone: string;
            email: string;
            contact_info: { phone: string; email: string };
            [key: string]: any;
        }
        
        // Helper to check and obfuscate
        const processRBAC = (row: LeadRow, user: { role: string; permissions: string[] }) => {
            if (user.role === 'admin') return { ...row, canManage: true };
            
            // Assume the category name is already joined as "category_name"
            const hasPermission = user.permissions?.includes(row.category_name);
            
            if (!hasPermission) {
                return {
                    ...row,
                    phone: '*** Oculto ***',
                    email: '*** Oculto ***',
                    contact_info: { phone: '*** Oculto ***', email: '*** Oculto ***' },
                    canManage: false
                };
            }
            return { ...row, canManage: true };
        };

        // Fetch leads with category info and contact details extracted
        const leadsQuery = `
            SELECT l.*, l.contact_info->>'phone' as phone, l.contact_info->>'email' as email, 
                   c.name as category_name, l.updated_at
            FROM leads l
            LEFT JOIN categories c ON l.category_id = c.id
            ORDER BY COALESCE(l.updated_at, l.created_at) DESC LIMIT 100
        `;
        const leadsRes = await db.query(leadsQuery);

        // Fetch appointments with lead and category info
        let appointmentsQuery = `
            SELECT a.*, l.client_name, l.contact_info->>'phone' as phone, l.contact_info->>'email' as email, 
                   c.name as category_name 
            FROM appointments a 
            LEFT JOIN leads l ON a.lead_id = l.id 
            LEFT JOIN categories c ON a.category_id = c.id
        `;
        const queryValues = [];
        if (date) {
            appointmentsQuery += ` WHERE DATE(a.date_time AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') = $1 `;
            queryValues.push(date);
        }
        appointmentsQuery += ` ORDER BY a.date_time DESC LIMIT 100`;
        
        const apptsRes = await db.query(appointmentsQuery, queryValues);

        const processedLeads = leadsRes.rows.map(r => processRBAC(r as LeadRow, user as { role: string; permissions: string[] }));
        const processedAppts = apptsRes.rows.map(r => processRBAC(r as LeadRow, user as { role: string; permissions: string[] }));

        return res.status(200).json({
            leads: processedLeads,
            appointments: processedAppts
        });
    } catch (e) {
        console.error('Error fetching dashboard data', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
