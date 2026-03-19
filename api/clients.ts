// @ts-nocheck
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, desc, sql } from 'drizzle-orm';
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
        if (req.method === 'PATCH') {
            const { id } = req.query;
            const { client_name, phone, email, note } = req.body;
            if (!id) return res.status(200).json({ error: 'Missing client id', client: {} });

            const updateData: any = {};
            if (client_name) updateData.client_name = client_name;
            
            const contactInfoUpdates: any = {};
            if (phone !== undefined) contactInfoUpdates.phone = phone;
            if (email !== undefined) contactInfoUpdates.email = email;
            if (note !== undefined) contactInfoUpdates.note = note;

            if (Object.keys(contactInfoUpdates).length > 0) {
                updateData.contact_info = sql`COALESCE(${schema.leads.contact_info}, '{}'::jsonb) || ${sql.raw(`'${JSON.stringify(contactInfoUpdates)}'`)}::jsonb`;
            }

            if (Object.keys(updateData).length > 0) {
                await db.update(schema.leads).set(updateData).where(eq(schema.leads.id, id as string));
            }

            const client = (await db.query.leads.findFirst({ where: eq(schema.leads.id, id as string) })) || {};
            return res.status(200).json({ message: 'Client updated successfully', client });
        }

        if (req.method === 'GET') {
            const clients = (await db.select({
                id: schema.leads.id,
                client_name: schema.leads.client_name,
                is_bot_enabled: schema.leads.is_bot_enabled,
                phone: sql<string>`${schema.leads.contact_info}->>'phone'`,
                email: sql<string>`${schema.leads.contact_info}->>'email'`,
                note: sql<string>`${schema.leads.contact_info}->>'note'`,
                total_appointments: sql<number>`count(${schema.appointments.id})`,
                last_appointment: sql<string>`max(${schema.appointments.date_time})`
            })
            .from(schema.leads)
            .leftJoin(schema.appointments, eq(schema.leads.id, schema.appointments.lead_id))
            .groupBy(schema.leads.id, schema.leads.client_name, schema.leads.is_bot_enabled, schema.leads.contact_info)
            .orderBy(sql`max(${schema.appointments.date_time}) DESC NULLS LAST`)) || [];

            return res.status(200).json({ clients });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('[API ERROR] Clients:', e);
        return res.status(200).json({ clients: [], error_managed: true });
    }
}

