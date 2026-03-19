
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, sql } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';


export default async function handler(req: VercelRequest, res: VercelResponse) {
    let user;
    try {
        user = await requireAuth(req, res);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!user) return;

    try {
        const checkPermission = async (id: string, user: any) => {
            if (user.role === 'admin') return true;
            try {
                const appt = await db.query.appointments.findFirst({
                    where: eq(schema.appointments.id, id),
                    with: { category: true }
                });
                if (!appt) return false;
                return user.permissions?.includes(appt.category?.name);
            } catch (e) {
                return false;
            }
        };

        if (req.method === 'PATCH') {
            const { id } = req.query;
            if (!id || typeof id !== 'string') return res.status(200).json({ error: 'Missing appointment ID', appointment: {} });

            if (!await checkPermission(id, user)) {
                return res.status(200).json({ error: 'No tienes permiso', appointment: {} });
            }

            const { status, date_time, service_type, client_name, phone, selected_services, total_price, total_duration, payment_method } = req.body;

            const updateData: any = {};
            if (status !== undefined) updateData.status = status;
            if (date_time !== undefined) updateData.date_time = new Date(date_time);
            if (service_type !== undefined) updateData.service_type = service_type;
            if (selected_services !== undefined) updateData.selected_services = selected_services;
            if (total_price !== undefined) updateData.total_price = total_price.toString();
            if (total_duration !== undefined) updateData.total_duration = total_duration;
            if (payment_method !== undefined) updateData.payment_method = payment_method;

            let appointment = {};
            if (Object.keys(updateData).length > 0) {
                const result = await db.update(schema.appointments)
                    .set(updateData)
                    .where(eq(schema.appointments.id, id))
                    .returning();
                appointment = result[0] || {};
            } else {
                appointment = (await db.query.appointments.findFirst({ where: eq(schema.appointments.id, id) })) || {};
            }

            // Sync Lead name/phone
            try {
                if ((client_name !== undefined || phone !== undefined) && (appointment as any).lead_id) {
                    const leadUpdate: any = {};
                    if (client_name !== undefined) leadUpdate.client_name = client_name;
                    if (phone !== undefined) {
                        leadUpdate.contact_info = sql`jsonb_set(COALESCE(${schema.leads.contact_info}, '{}'::jsonb), '{phone}', ${sql.raw(`'${JSON.stringify(phone)}'`)}::jsonb)`;
                    }
                    if (Object.keys(leadUpdate).length > 0) {
                        await db.update(schema.leads)
                            .set(leadUpdate)
                            .where(eq(schema.leads.id, (appointment as any).lead_id));
                    }
                }
            } catch (e) { console.error('[API SYNC ERROR]', e); }

            return res.status(200).json({ appointment });

        } else if (req.method === 'POST') {
            const { lead_id, date_time, service_type, category_id, selected_services, total_price, total_duration } = req.body;
            if (!lead_id || !date_time || !service_type) return res.status(200).json({ error: 'Missing required fields', appointment: {} });

            const result = await db.insert(schema.appointments).values({
                lead_id,
                date_time: new Date(date_time),
                service_type,
                status: 'confirmed',
                category_id,
                selected_services: selected_services || [],
                total_price: total_price?.toString() || '0',
                total_duration: total_duration || 0
            }).returning();

            await db.update(schema.leads).set({ status: 'qualified' }).where(eq(schema.leads.id, lead_id));

            return res.status(201).json({ appointment: result[0] || {} });

        } else if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id || typeof id !== 'string') return res.status(200).json({ error: 'Missing ID', appointment: {} });

            if (!await checkPermission(id, user)) {
                return res.status(200).json({ error: 'No tienes permiso', appointment: {} });
            }

            const result = await db.update(schema.appointments)
                .set({ status: 'canceled' })
                .where(eq(schema.appointments.id, id))
                .returning();

            return res.status(200).json({ message: 'Appointment soft deleted', appointment: result[0] || {} });
        } else {
            return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (e) {
        console.error('[API ERROR] Appointments:', e);
        return res.status(200).json({ appointment: {}, error_managed: true });
    }
}

