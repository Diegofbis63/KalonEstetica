
import { db, sql } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { startOfDay, endOfDay, startOfWeek, startOfMonth, startOfYear, parseISO } from 'date-fns';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        if (req.method === 'GET') {
            const { period, startDate, endDate } = req.query;
            
            // Use JS dates to avoid Postgres TZ issues with CURRENT_DATE
            // We want the start of the period in Argentina time (approx by using local server time)
            const now = new Date();
            let start: Date = startOfMonth(now);
            let end: Date = endOfDay(now);

            if (period === 'hoy') {
                start = startOfDay(now);
            } else if (period === 'semana') {
                start = startOfWeek(now, { weekStartsOn: 1 });
            } else if (period === 'mes') {
                start = startOfMonth(now);
            } else if (period === 'año') {
                start = startOfYear(now);
            } else if (period === 'personalizado' && startDate && endDate) {
                start = startOfDay(parseISO(startDate as string));
                end = endOfDay(parseISO(endDate as string));
            }

            // 1. Fetch payments
            const payments = await db.query.appointments.findMany({
                where: and(
                    eq(schema.appointments.status, 'REALIZADA'),
                    gte(schema.appointments.date_time, start),
                    lte(schema.appointments.date_time, end)
                ),
                orderBy: [desc(schema.appointments.date_time)],
                with: { lead: true }
            });

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

            const revenue = mappedPayments.reduce((acc, p) => acc + p.amount, 0);
            const count = mappedPayments.length;
            const ticket = count > 0 ? (revenue / count) : 0;

            // Evolution
            const evolutionMap: Record<string, number> = {};
            mappedPayments.forEach(p => {
                const day = p.date.split('T')[0];
                evolutionMap[day] = (evolutionMap[day] || 0) + p.amount;
            });

            const evolution = Object.entries(evolutionMap)
                .map(([date, amount]) => ({ date, revenue: amount }))
                .sort((a, b) => a.date.localeCompare(b.date));

            return res.status(200).json({ 
                stats: { revenue, ticket, count },
                evolution,
                payments: mappedPayments
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[INCOME API ERROR]:', e);
        return res.status(500).json({ error: 'Internal Server Error', details: (e as Error).message });
    }
}
