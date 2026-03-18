// @ts-nocheck
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, desc, and, sql, gte, lt, asc } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        const { period = 'mes', startDate, endDate } = req.query;
        let whereClause = eq(schema.appointments.status, 'REALIZADA');

        if (period === 'hoy') {
            whereClause = and(whereClause, sql`${schema.appointments.date_time} >= CURRENT_DATE`, sql`${schema.appointments.date_time} < CURRENT_DATE + INTERVAL '1 day'`) as any;
        } else if (period === 'semana') {
            whereClause = and(whereClause, sql`${schema.appointments.date_time} >= date_trunc('week', CURRENT_DATE)`) as any;
        } else if (period === 'mes') {
            whereClause = and(whereClause, sql`${schema.appointments.date_time} >= date_trunc('month', CURRENT_DATE)`) as any;
        } else if (period === 'año') {
            whereClause = and(whereClause, sql`${schema.appointments.date_time} >= date_trunc('year', CURRENT_DATE)`) as any;
        } else if (period === 'personalizado' && startDate && endDate) {
            whereClause = and(whereClause, gte(schema.appointments.date_time, new Date(startDate as string)), lt(schema.appointments.date_time, new Date(`${endDate} 23:59:59`))) as any;
        }

        // 1. KPI Stats
        const stats = await db.select({
            total_revenue: sql`COALESCE(SUM(${schema.appointments.total_price}::numeric), 0)`,
            total_count: sql`COUNT(*)`,
            average_ticket: sql`CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(${schema.appointments.total_price}::numeric), 0) / COUNT(*) ELSE 0 END`
        })
        .from(schema.appointments)
        .where(whereClause);

        const kpi = stats[0];

        // 2. Evolution
        const evolution = await db.select({
            date: sql`DATE(${schema.appointments.date_time})`,
            revenue: sql`SUM(${schema.appointments.total_price}::numeric)`
        })
        .from(schema.appointments)
        .where(whereClause)
        .groupBy(sql`DATE(${schema.appointments.date_time})`)
        .orderBy(asc(sql`DATE(${schema.appointments.date_time})`));

        // 3. Payments
        const payments = await db.select({
            id: schema.appointments.id,
            lead_id: schema.appointments.lead_id,
            client_name: schema.leads.client_name,
            is_bot_enabled: schema.leads.is_bot_enabled,
            parent_service: schema.categories.name,
            selected_services: schema.appointments.selected_services,
            date: schema.appointments.date_time,
            amount: schema.appointments.total_price,
            status: schema.appointments.status,
            payment_method: schema.appointments.payment_method
        })
        .from(schema.appointments)
        .leftJoin(schema.leads, eq(schema.appointments.lead_id, schema.leads.id))
        .leftJoin(schema.categories, eq(schema.appointments.category_id, schema.categories.id))
        .where(whereClause)
        .orderBy(desc(schema.appointments.date_time))
        .limit(100);

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
        console.error('Error in /api/income', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
