
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';
import { eq, and, sql as drizzleSql, asc, desc } from 'drizzle-orm';
import type { ConvState, Category, Service } from './stateMachine.js';

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
    console.error("[db.ts] CRITICAL: Database connection string is missing!");
}

export const sql = neon(connectionString!);
export const db = drizzle(sql, { schema });

export async function getCategories(): Promise<Category[]> {
    console.log("[db.ts] Fetching categories...");
    const results = await db.query.categories.findMany({
        where: eq(schema.categories.active, true),
        orderBy: [asc(schema.categories.sort_order)]
    });
    return results as Category[];
}

export async function getActiveServices(): Promise<Service[]> {
    console.log("[db.ts] Fetching active services...");
    const results = await db.query.services.findMany({
        where: eq(schema.services.active, true),
        orderBy: [asc(schema.services.sort_order)]
    });
    // Map to stateMachine.Service type (legacy names)
    return results.map(s => ({
        ...s,
        category_name: s.category || "Servicio",
        duration: s.duration || `${s.duration_min} min`
    })) as unknown as Service[];
}

export async function getLeadByPhone(phone: string) {
    console.log(`[db.ts] Searching lead by phone: ${phone}`);
    const normalized = phone.replace(/\D/g, '');
    const results = await sql`SELECT id, is_bot_enabled, client_name, contact_info, current_state, updated_at FROM leads WHERE regexp_replace(contact_info->>'phone', '\\D', '', 'g') LIKE ${'%' + normalized} LIMIT 1`;
    return results.length > 0 ? results[0] : null;
}

export async function findLeadByFlexiblePhone(phone: string) {
    const normalized = phone.replace(/\D/g, '').slice(-10);
    if (!normalized || normalized.length < 7) return null;
    
    console.log(`[db.ts] Searching lead by last 10 digits: ${normalized}`);
    const results = await sql`
        SELECT id, is_bot_enabled, client_name, contact_info, current_state, updated_at 
        FROM leads 
        WHERE regexp_replace(contact_info->>'phone', '\\D', '', 'g') LIKE ${'%' + normalized} 
        LIMIT 1
    `;
    return results.length > 0 ? results[0] : null;
}

export async function getChatHistory(leadId: string) {
    console.log(`[db.ts] Fetching chat history for lead: ${leadId}`);
    return await db.query.chat_logs.findMany({
        where: eq(schema.chat_logs.lead_id, leadId),
        orderBy: [asc(schema.chat_logs.created_at)]
    });
}

export async function updateLeadName(leadId: string, name: string) {
    console.log(`[db.ts] Updating lead ${leadId} name to: ${name}`);
    return await db.update(schema.leads).set({ client_name: name, updated_at: new Date() }).where(eq(schema.leads.id, leadId));
}

export async function insertChatLog(leadId: string, role: string, content: string, mediaUrl: string | null, sentToWhatsapp: boolean, mediaData?: string | null) {
    console.log(`[db.ts] Inserting chat log for lead ${leadId} (${role})`);
    return await db.insert(schema.chat_logs).values({
        lead_id: leadId,
        role,
        content,
        media_url: mediaUrl,
        media_data: mediaData || null,
        sent_to_whatsapp: sentToWhatsapp
    });
}

export async function createLead(orgId: string, name: string, contactInfo: any) {
    console.log(`[db.ts] Creating a new lead for: ${name}`);
    const results = await db.insert(schema.leads).values({
        organization_id: orgId,
        client_name: name,
        contact_info: contactInfo,
        status: 'qualified',
        intent_score: 70
    }).returning({ id: schema.leads.id });
    return results[0];
}

export async function getAppointmentsForDate(dateStr: string) {
    console.log(`[db.ts] Checking appointments for date: ${dateStr}`);
    // Using raw SQL for date_time casting for simplicity with current structure
    return await sql`SELECT date_time FROM appointments WHERE date_time::date = ${dateStr} AND status != 'canceled'`;
}

export async function createAppointment(leadId: string, orgId: string, dateTime: string, catNames: string, price: number, duration: number, selectedServices: Service[]) {
    console.log(`[db.ts] Creating appointment for lead ${leadId} at ${dateTime}`);
    return await db.insert(schema.appointments).values({
        lead_id: leadId,
        organization_id: orgId,
        date_time: new Date(dateTime),
        service_type: catNames,
        status: 'confirmed',
        total_price: price.toString(),
        total_duration: duration,
        selected_services: selectedServices
    });
}

export async function markLeadAsConverted(leadId: string) {
    console.log(`[db.ts] Marking lead ${leadId} as converted`);
    return await db.update(schema.leads).set({ status: 'converted', updated_at: new Date() }).where(eq(schema.leads.id, leadId));
}

export async function updateLeadState(leadId: string, state: ConvState) {
    console.log(`[db.ts] Updating lead ${leadId} current_state`);
    return await db.update(schema.leads).set({ current_state: state, updated_at: new Date() }).where(eq(schema.leads.id, leadId));
}
