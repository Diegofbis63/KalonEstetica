
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
        const { id } = req.query;

        if (req.method === 'GET') {
            // Fetch multiple or single
            if (id) {
                const appointment = await db.query.appointments.findFirst({
                    where: eq(schema.appointments.id, id as string),
                    with: { lead: true, category: true }
                });
                return res.status(200).json({ appointment });
            }
            const appointments = await db.query.appointments.findMany({
                orderBy: [desc(schema.appointments.date_time)],
                limit: 100,
                with: { lead: true, category: true }
            });
            return res.status(200).json({ appointments });
        }

        if (req.method === 'POST') {
            const { lead_id, date_time, service_type, category_id, selected_services, total_price, total_duration } = req.body;
            
            if (!lead_id || !date_time) return res.status(400).json({ error: 'Missing Required Fields' });

            const [newAppt] = await db.insert(schema.appointments).values({
                lead_id,
                date_time: new Date(date_time),
                service_type: service_type || 'General',
                category_id: category_id || null,
                selected_services: selected_services || [],
                total_price: Number(total_price) || 0,
                total_duration: Number(total_duration) || 0,
                status: 'pending',
                created_at: new Date()
            }).returning();

            return res.status(201).json(newAppt);
        }

        if (req.method === 'PATCH') {
            if (!id) return res.status(400).json({ error: 'Missing ID' });
            
            const { status, date_time, service_type, client_name, phone, selected_services, total_price, total_duration, category_id } = req.body;
            
            // 1. Update Appointment
            const updateObj: any = { 
                updated_at: new Date()
            };
            if (status) updateObj.status = status;
            if (date_time) updateObj.date_time = new Date(date_time);
            if (service_type) updateObj.service_type = service_type;
            if (selected_services) updateObj.selected_services = selected_services;
            if (total_price !== undefined) updateObj.total_price = Number(total_price);
            if (total_duration !== undefined) updateObj.total_duration = Number(total_duration);
            if (category_id) updateObj.category_id = category_id;

            await db.update(schema.appointments)
                .set(updateObj)
                .where(eq(schema.appointments.id, id as string));

            // 2. If client_name or phone updated, update Lead too
            const appt = await db.query.appointments.findFirst({
                where: eq(schema.appointments.id, id as string)
            });

            if (appt?.lead_id && (client_name || phone)) {
                const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, appt.lead_id) });
                if (lead) {
                    const contactInfo = lead.contact_info || {};
                    if (client_name) lead.client_name = client_name;
                    if (phone) (contactInfo as any).phone = phone;
                    
                    await db.update(schema.leads)
                        .set({ client_name: lead.client_name, contact_info: contactInfo, updated_at: new Date() })
                        .where(eq(schema.leads.id, lead.id));
                }
            }

            return res.status(200).json({ success: true });
        }

        if (req.method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing ID' });
            await db.delete(schema.appointments).where(eq(schema.appointments.id, id as string));
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[APPOINTMENTS API ERROR]:', e);
        return res.status(500).json({ error: 'Internal Server Error', details: (e as Error).message });
    }
}
