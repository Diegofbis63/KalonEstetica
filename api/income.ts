import { getDb } from '../utils/db.js';
import { requireAuth } from '../utils/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        const db = getDb();
        const { period = 'mes', startDate, endDate } = req.query;
        
        let dateFilter = '';
        if (period === 'hoy') {
            dateFilter = "AND a.date_time >= CURRENT_DATE AND a.date_time < CURRENT_DATE + INTERVAL '1 day'";
        } else if (period === 'semana') {
            dateFilter = "AND a.date_time >= date_trunc('week', CURRENT_DATE)";
        } else if (period === 'mes') {
            dateFilter = "AND a.date_time >= date_trunc('month', CURRENT_DATE)";
        } else if (period === 'año') {
            dateFilter = "AND a.date_time >= date_trunc('year', CURRENT_DATE)";
        } else if (period === 'personalizado' && startDate && endDate) {
            dateFilter = `AND a.date_time >= '${startDate}' AND a.date_time <= '${endDate} 23:59:59'`;
        }

        // 1. KPI Stats
        const statsQuery = `
            SELECT 
                COALESCE(SUM(total_price), 0) as total_revenue,
                COUNT(*) as total_count,
                CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total_price), 0) / COUNT(*) ELSE 0 END as average_ticket
            FROM appointments a
            WHERE status = 'REALIZADA' ${dateFilter}
        `;
        const statsRes = await db.query(statsQuery);
        const stats = statsRes.rows[0];

        // 2. Daily Evolution (for the current month)
        const evolutionQuery = `
            SELECT 
                DATE(a.date_time) as date,
                SUM(total_price) as revenue
            FROM appointments a
            WHERE status = 'REALIZADA' 
            ${dateFilter || "AND a.date_time >= date_trunc('month', CURRENT_DATE)"}
            GROUP BY DATE(a.date_time)
            ORDER BY DATE(a.date_time) ASC
        `;
        const evolutionRes = await db.query(evolutionQuery);

        // 3. Recent Payments Table
        const paymentsQuery = `
            SELECT 
                a.id,
                a.lead_id,
                l.client_name,
                l.is_bot_enabled,
                c.name as parent_service,
                a.selected_services,
                a.date_time as date,
                a.total_price as amount,
                a.status,
                a.payment_method
            FROM appointments a
            LEFT JOIN leads l ON a.lead_id = l.id
            LEFT JOIN categories c ON a.category_id = c.id
            WHERE a.status = 'REALIZADA' ${dateFilter}
            ORDER BY a.date_time DESC
            LIMIT 100
        `;
        const paymentsRes = await db.query(paymentsQuery);

        return res.status(200).json({
            stats: {
                revenue: parseFloat(stats.total_revenue),
                ticket: parseFloat(stats.average_ticket),
                count: parseInt(stats.total_count)
            },
            evolution: evolutionRes.rows.map(r => ({
                date: r.date,
                revenue: parseFloat(r.revenue)
            })),
            payments: paymentsRes.rows.map(r => {
                const services = r.selected_services || [];
                const categories = Array.from(new Set(services.map((s: { category_name?: string }) => s.category_name))).filter(Boolean);
                const displayService = categories.length > 0 ? categories.join(" + ") : (r.parent_service || 'Servicio General');

                return {
                    ...r,
                    parent_service: displayService,
                    amount: parseFloat(r.amount)
                };
            })
        });

    } catch (e) {
        console.error('Error fetching income data', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
