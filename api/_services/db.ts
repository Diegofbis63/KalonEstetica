import { neon } from '@neondatabase/serverless';
import type { ConvState, Category, Service } from './stateMachine.js';

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
    console.error("[db.ts] CRITICAL: Database connection string is missing!");
}

export const sql = neon(connectionString!);

export async function getCategories(): Promise<Category[]> {
    console.log("[db.ts] Fetching categories...");
    const results = await sql`SELECT id, name FROM categories WHERE active = true ORDER BY sort_order ASC`;
    return results as Category[];
}

export async function getActiveServices(): Promise<Service[]> {
    console.log("[db.ts] Fetching active services...");
    const results = await sql`SELECT id, category_id, title, price, duration, category as category_name FROM services WHERE active = true ORDER BY sort_order ASC`;
    return results as unknown as Service[];
}

export async function getLeadByPhone(phone: string) {
    console.log(`[db.ts] Searching lead by phone: ${phone}`);
    const results = await sql`SELECT id, is_bot_enabled, client_name, contact_info, current_state, updated_at FROM leads WHERE regexp_replace(contact_info->>'phone', '\\D', '', 'g') LIKE ${'%' + phone} LIMIT 1`;
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
    return await sql`
        SELECT role, content, media_url, media_data 
        FROM chat_logs 
        WHERE lead_id = ${leadId}
        ORDER BY created_at ASC
    `;
}

export async function updateLeadName(leadId: string, name: string) {
    console.log(`[db.ts] Updating lead ${leadId} name to: ${name}`);
    return await sql`UPDATE leads SET client_name = ${name}, updated_at = NOW() WHERE id = ${leadId}`;
}

export async function insertChatLog(leadId: string, role: string, content: string, mediaUrl: string | null, sentToWhatsapp: boolean, mediaData?: string | null) {
    console.log(`[db.ts] Inserting chat log for lead ${leadId} (${role})`);
    return await sql`INSERT INTO chat_logs (lead_id, role, content, media_url, media_data, sent_to_whatsapp) 
                     VALUES (${leadId}, ${role}, ${content}, ${mediaUrl}, ${mediaData || null}, ${sentToWhatsapp})`;
}

export async function createLead(orgId: string, name: string, contactInfo: { phone: string, source: string }) {
    console.log(`[db.ts] Creating a new lead for: ${name}`);
    const results = await sql`INSERT INTO leads (organization_id, client_name, contact_info, status, intent_score) 
                              VALUES (${orgId}, ${name}, ${JSON.stringify(contactInfo)}, 'qualified', 70) 
                              RETURNING id`;
    return results[0];
}

export async function getAppointmentsForDate(dateStr: string) {
    console.log(`[db.ts] Checking appointments for date: ${dateStr}`);
    return await sql`SELECT date_time FROM appointments WHERE date_time::date = ${dateStr} AND status != 'canceled'`;
}

export async function createAppointment(leadId: string, orgId: string, dateTime: string, catNames: string, price: number, duration: number, selectedServices: Service[]) {
    console.log(`[db.ts] Creating appointment for lead ${leadId} at ${dateTime}`);
    return await sql`INSERT INTO appointments (lead_id, organization_id, date_time, service_type, status, total_price, total_duration, selected_services) 
                     VALUES (${leadId}, ${orgId}, ${dateTime}, ${catNames}, 'confirmed', ${price}, ${duration}, ${JSON.stringify(selectedServices)})`;
}

export async function markLeadAsConverted(leadId: string) {
    console.log(`[db.ts] Marking lead ${leadId} as converted`);
    return await sql`UPDATE leads SET status = 'converted', updated_at = NOW() WHERE id = ${leadId}`;
}
export async function updateLeadState(leadId: string, state: ConvState) {
    console.log(`[db.ts] Updating lead ${leadId} current_state`);
    return await sql`UPDATE leads SET current_state = ${state as any}, updated_at = NOW() WHERE id = ${leadId}`;
}
