
import { db, sql } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, and, desc, sql as drizzleSql } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        if (req.method === 'GET') {
            const { period, startDate, endDate } = req.query;
            
            // Build DATE filter (Argentina Time)
            let timeframe = drizzleSql`1=1`;
            if (period === 'hoy') {
                timeframe = drizzleSql`(${schema.appointments.date_time} AT TIME ZONE 'America/Argentina/Cordoba')::date = CURRENT_DATE`;
            } else if (period === 'semana') {
                timeframe = drizzleSql`(${schema.appointments.date_time} AT TIME ZONE 'America/Argentina/Cordoba') >= date_trunc('week', CURRENT_DATE)`;
            } else if (period === 'mes') {
                timeframe = drizzleSql`(${schema.appointments.date_time} AT TIME ZONE 'America/Argentina/Cordoba') >= date_trunc('month', CURRENT_DATE)`;
            } else if (period === 'año') {
                timeframe = drizzleSql`(${schema.appointments.date_time} AT TIME ZONE 'America/Argentina/Cordoba') >= date_trunc('year', CURRENT_DATE)`;
            } else if (period === 'personalizado' && startDate && endDate) {
                timeframe = drizzleSql`(${schema.appointments.date_time} AT TIME ZONE 'America/Argentina/Cordoba')::date BETWEEN ${startDate} AND ${endDate}`;
            }

            // 1. Fetch ALL payments (Appointments marked as REALIZADA)
            const payments = await db.query.appointments.findMany({
                where: and(eq(schema.appointments.status, 'REALIZADA'), timeframe),
                orderBy: [desc(schema.appointments.date_time)],
                with: { lead: true }
            });

            // 2. Map Payments
            const mappedPayments = (payments as any[]).map(p => {
                const lead = p.lead || {};
                const contactInfo = lead.contact_info || {};
                const selectedServices = Array.isArray(p.selected_services) ? p.selected_services : [];
                
                return {
                    id: p.id,
                    lead_id: p.lead_id,
                    client_name: lead.client_name || 'Sin Nombre',
                    is_bot_enabled: Boolean(lead.is_bot_enabled),
                    parent_service: p.service_type || 'General',
                    selected_services: selectedServices.map((s: any) => ({
                        title: s.title || (s.name || 'Servicio'),
                        price: Number(s.price) || 0
                    })),
                    date: p.date_time.toISOString(),
                    amount: Number(p.total_price) || 0,
                    status: p.status || 'pending',
                    payment_method: p.payment_method || 'Sin Especificar',
                    phone: contactInfo.phone || null
                };
            });

            // 3. Stats calculation
            const revenue = mappedPayments.reduce((acc, p) => acc + p.amount, 0);
            const count = mappedPayments.length;
            const ticket = count > 0 ? (revenue / count) : 0;

            // 4. Evolution (Days/Months depending on period)
            const evolutionRaw = await sql`
                SELECT 
                    date_trunc('day', ${schema.appointments.date_time} AT TIME ZONE 'America/Argentina/Cordoba')::date as day,
                    SUM(total_price)::numeric as total
                FROM appointments
                WHERE status = 'REALIZADA' AND ${timeframe}
                GROUP BY day
                ORDER BY day ASC
            `;

            const evolution = evolutionRaw.map((e: any) => ({
                date: e.day.toISOString(),
                revenue: Number(e.total) || 0
            }));

            return res.status(200).json({ 
                stats: { revenue, ticket, count },
                evolution: evolution,
                payments: mappedPayments
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[INCOME API ERROR]:', e);
        return res.status(500).json({ error: 'Internal Server Error', details: (e as Error).message });
    }
}
