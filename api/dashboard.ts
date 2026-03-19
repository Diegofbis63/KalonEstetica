// @ts-nocheck
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireAuth(req, res);
    if (!auth) return;

    try {
        const { date } = req.query; 

        // 0. Load User Context (Role & Category Permissions)
        const userWithPerms = await db.query.admin_users.findFirst({
            where: eq(schema.admin_users.id, auth.id),
        });
        
        const userPermissions = await db.select({
            category_id: schema.user_permissions.category_id,
            category_name: schema.categories.name
        })
        .from(schema.user_permissions)
        .leftJoin(schema.categories, eq(schema.user_permissions.category_id, schema.categories.id))
        .where(eq(schema.user_permissions.user_id, auth.id));

        const allowedCategoryIds = userPermissions.map(p => p.category_id);
        const allowedCategoryNames = userPermissions.map(p => p.category_name);

        // Fetch leads directly including phone/email
        const leadsRes = await db.select({
            id: schema.leads.id,
            client_name: schema.leads.client_name,
            status: schema.leads.status,
            intent_score: schema.leads.intent_score,
            created_at: schema.leads.created_at,
            updated_at: schema.leads.updated_at,
            is_bot_enabled: schema.leads.is_bot_enabled,
            category_id: schema.leads.category_id,
            category_name: schema.categories.name,
            phone: sql<string>`${schema.leads.contact_info}->>'phone'`,
            email: sql<string>`${schema.leads.contact_info}->>'email'`,
            note: sql<string>`${schema.leads.contact_info}->>'note'`
        })
        .from(schema.leads)
        .leftJoin(schema.categories, eq(schema.leads.category_id, schema.categories.id))
        .orderBy(desc(schema.leads.updated_at))
        .limit(100);

        // Fetch appointments with full client info
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
            category_id: schema.appointments.category_id,
            client_name: schema.leads.client_name,
            phone: sql<string>`${schema.leads.contact_info}->>'phone'`,
            email: sql<string>`${schema.leads.contact_info}->>'email'`,
            is_bot_enabled: schema.leads.is_bot_enabled
        })
        .from(schema.appointments)
        .leftJoin(schema.leads, eq(schema.appointments.lead_id, schema.leads.id))
        .leftJoin(schema.categories, eq(schema.appointments.category_id, schema.categories.id));

        let finalApptsQuery = appointmentsQuery;
        if (date) {
            finalApptsQuery = appointmentsQuery.where(sql`DATE(${schema.appointments.date_time} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Cordoba') = ${date}`);
        }

        const apptsRes = await finalApptsQuery.orderBy(desc(schema.appointments.date_time)).limit(100);

        // 3. RBAC Processing Logic
        const processRBAC = (row: any) => {
            // Admins see everything
            if (auth.role === 'admin') return { ...row, canManage: true };
            
            // For staff, we check if the item's category is in their allowed list
            const hasPermission = allowedCategoryNames.includes(row.category_name) || allowedCategoryIds.includes(row.category_id);
            
            if (!hasPermission) {
                return {
                    ...row,
                    phone: '*** Oculto ***',
                    email: '*** Oculto ***',
                    canManage: false
                };
            }
            return { ...row, canManage: true };
        };

        return res.status(200).json({
            leads: leadsRes.map(processRBAC),
            appointments: apptsRes.map(processRBAC)
        });
    } catch (e) {
        console.error('Error in Dashboard API:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
