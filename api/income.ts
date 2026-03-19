// @ts-nocheck
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, desc, and, or, sql, gte, lt, asc } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';


export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    let user;
    try {
        user = await requireAuth(req, res);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!user) return;

    try {
        const { period = 'mes', startDate, endDate } = req.query;

        let dateFilter;
        if (period === 'hoy') {
            dateFilter = and(sql`${schema.appointments.date_time} >= CURRENT_DATE`, sql`${schema.appointments.date_time} < CURRENT_DATE + INTERVAL '1 day'`);
        } else if (period === 'semana') {
            dateFilter = sql`${schema.appointments.date_time} >= date_trunc('week', CURRENT_DATE)`;
        } else if (period === 'mes') {
            dateFilter = sql`${schema.appointments.date_time} >= date_trunc('month', CURRENT_DATE)`;
        } else if (period === 'año') {
            dateFilter = sql`${schema.appointments.date_time} >= date_trunc('year', CURRENT_DATE)`;
        } else if (period === 'personalizado' && startDate && endDate) {
            dateFilter = and(gte(schema.appointments.date_time, new Date(startDate as string)), lt(schema.appointments.date_time, new Date(`${endDate} 23:59:59`)));
        }

        const statusFilter = or(
            eq(schema.appointments.status, 'completed'),
            eq(schema.appointments.status, 'REALIZADA'),
            eq(schema.appointments.status, 'realizada'),
            eq(schema.appointments.status, 'REALIZADO'),
            eq(schema.appointments.status, 'realizado')
        );

        let whereClause = dateFilter ? and(statusFilter, dateFilter) : statusFilter;

        // 1. KPI Stats
        const stats = await db.select({
            total_revenue: sql`COALESCE(SUM(${schema.appointments.total_price}::numeric), 0)`,
            total_count: sql`COUNT(*)`,
            average_ticket: sql`CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(${schema.appointments.total_price}::numeric), 0) / COUNT(*) ELSE 0 END`
        })
        .from(schema.appointments)
        .where(whereClause as any);

        const kpi = stats[0] || { total_revenue: '0', total_count: '0', average_ticket: '0' };

        // 2. Evolution
        const evolution = (await db.select({
            date: sql`DATE(${schema.appointments.date_time})`,
            revenue: sql`SUM(${schema.appointments.total_price}::numeric)`
        })
        .from(schema.appointments)
        .where(whereClause)
        .groupBy(sql`DATE(${schema.appointments.date_time})`)
        .orderBy(asc(sql`DATE(${schema.appointments.date_time})`))) || [];

        // 3. Payments
        const payments = (await db.select({
            id: schema.appointments.id,
            lead_id: schema.appointments.lead_id,
            client_name: sql`COALESCE(${schema.leads.client_name}, 'Cliente sin Registro')`,
            is_bot_enabled: schema.leads.is_bot_enabled,
            category_name: schema.categories.name,
            selected_services: schema.appointments.selected_services,
            date: schema.appointments.date_time,
            amount: schema.appointments.total_price,
            status: schema.appointments.status,
            payment_method: schema.appointments.payment_method,
            phone: sql<string>`COALESCE(${schema.leads.contact_info}->>'phone', 'S/D')`
        })
        .from(schema.appointments)
        .leftJoin(schema.leads, eq(schema.appointments.lead_id, schema.leads.id))
        .leftJoin(schema.categories, eq(schema.appointments.category_id, schema.categories.id))
        .where(whereClause)
        .orderBy(desc(schema.appointments.date_time))
        .limit(100)) || [];

        return res.status(200).json({
            stats: {
                revenue: parseFloat(kpi.total_revenue as string),
                ticket: parseFloat(kpi.average_ticket as string),
                count: parseInt(kpi.total_count as string)
            },
            evolution: evolution.map(r => ({ date: r.date, revenue: parseFloat(r.revenue as string) })),
            payments: payments.map(r => ({ ...r, amount: parseFloat(r.amount as string) }))
        });

    } catch (e) {
        console.error('[API ERROR] Income:', e);
        return res.status(200).json({
            stats: { revenue: 0, ticket: 0, count: 0 },
            evolution: [],
            payments: [],
            error_managed: true
        });
    }
}

