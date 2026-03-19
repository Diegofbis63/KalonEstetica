
import { db, sql } from './_services/db.js';
import { requireAuth } from '../utils/auth.js';
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

        // DB Level Filtering (Low Overhead)
        const getFilter = () => {
          if (period === 'hoy') return sql`AND a.date_time >= CURRENT_DATE`;
          if (period === 'semana') return sql`AND a.date_time >= date_trunc('week', CURRENT_DATE)`;
          if (period === 'mes') return sql`AND a.date_time >= date_trunc('month', CURRENT_DATE)`;
          if (period === 'año') return sql`AND a.date_time >= date_trunc('year', CURRENT_DATE)`;
          if (period === 'personalizado' && startDate && endDate) {
            return sql`AND a.date_time >= ${startDate} AND a.date_time <= ${endDate + ' 23:59:59'}`;
          }
          return sql``;
        };

        const filter = getFilter();

        // 1. Core KPIs
        const statsRes = await sql`
            SELECT 
                COALESCE(SUM(a.total_price::numeric), 0) as revenue,
                COUNT(*) as count,
                CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(a.total_price::numeric), 0) / COUNT(*) ELSE 0 END as ticket
            FROM appointments a
            WHERE LOWER(a.status) IN ('completed', 'realizada', 'realizado') ${filter}
        `;

        // 2. Revenue Evolution
        const evolutionRes = await sql`
            SELECT DATE(a.date_time) as date, SUM(a.total_price::numeric) as revenue
            FROM appointments a
            WHERE LOWER(a.status) IN ('completed', 'realizada', 'realizado') ${filter}
            GROUP BY DATE(a.date_time)
            ORDER BY DATE(a.date_time) ASC
        `;

        // 3. Detailed Payments with Lead Info
        const paymentsRes = await sql`
            SELECT 
                a.id,
                a.lead_id,
                COALESCE(l.client_name, 'Sin registro') as client_name,
                c.name as category_name,
                a.selected_services,
                a.date_time as date,
                a.total_price as amount,
                a.status,
                a.payment_method,
                COALESCE(l.contact_info->>'phone', 'S/D') as phone
            FROM appointments a
            LEFT JOIN leads l ON l.id = a.lead_id
            LEFT JOIN categories c ON c.id = a.category_id
            WHERE LOWER(a.status) IN ('completed', 'realizada', 'realizado') ${filter}
            ORDER BY a.date_time DESC
            LIMIT 100
        `;

        const stats = statsRes[0] || { revenue: 0, count: 0, ticket: 0 };

        return res.status(200).json({
            stats: {
                revenue: parseFloat(stats.revenue || 0),
                count: parseInt(stats.count || 0),
                ticket: parseFloat(stats.ticket || 0)
            },
            evolution: evolutionRes.map((r: any) => ({ date: r.date, revenue: parseFloat(r.revenue || 0) })),
            payments: paymentsRes.map((r: any) => ({ ...r, amount: parseFloat(r.amount || 0) }))
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
