
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        const { date } = req.query; // For daily timeline filtering

        // Fetch leads with category info and chat history
        // Using raw SQL for the complex join/agg if needed, or Drizzle relational if possible
        const leadsRes = await db.query.leads.findMany({
            with: {
                category: true,
            },
            orderBy: [desc(schema.leads.updated_at), desc(schema.leads.created_at)],
            limit: 100
        });

        // Fetch appointments with lead and category info
        const appointmentsQuery = db.select({
            id: schema.appointments.id,
            lead_id: schema.appointments.lead_id,
            date_time: schema.appointments.date_time,
            service_type: schema.appointments.service_type,
            status: schema.appointments.status,
            total_price: schema.appointments.total_price,
            total_duration: schema.appointments.total_duration,
            selected_services: schema.appointments.selected_services,
            category_name: schema.categories.name,
            client_name: schema.leads.client_name,
            phone: sql<string>`${schema.leads.contact_info}->>'phone'`,
            email: sql<string>`${schema.leads.contact_info}->>'email'`,
            is_bot_enabled: schema.leads.is_bot_enabled
        })
        .from(schema.appointments)
        .leftJoin(schema.leads, eq(schema.appointments.lead_id, schema.leads.id))
        .leftJoin(schema.categories, eq(schema.appointments.category_id, schema.categories.id));

        if (date) {
            // Filter by date (Argentine Cordoba time)
            // Note: date_time is stored with TZ. To filter by local date:
            appointmentsQuery.where(sql`DATE(${schema.appointments.date_time} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Cordoba') = ${date}`);
        }

        const apptsRes = await appointmentsQuery.orderBy(desc(schema.appointments.date_time)).limit(100);

        // RBAC Processing
        const processRBAC = (row: any, user: any) => {
            if (user.role === 'admin') return { ...row, canManage: true };
            
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

        const processedLeads = leadsRes.map(l => {
            const raw = {
                ...l,
                category_name: l.category?.name,
                phone: (l.contact_info as any)?.phone,
                email: (l.contact_info as any)?.email
            };
            return processRBAC(raw, user);
        });
        
        const processedAppts = apptsRes.map(a => processRBAC(a, user));

        return res.status(200).json({
            leads: processedLeads,
            appointments: processedAppts
        });
    } catch (e) {
        console.error('Error fetching dashboard data', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
