
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
    const results = await sql`SELECT id, name, slug, description, image_url, active, sort_order, organization_id FROM categories WHERE active = true ORDER BY sort_order ASC`;
    return results as unknown as Category[];
}

export async function getActiveServices(): Promise<Service[]> {
    console.log("[db.ts] Fetching active services...");
    const results = await sql`SELECT id, category_id, title, description, price, duration, duration_min, active, sort_order FROM services WHERE active = true ORDER BY sort_order ASC`;
    return results.map(s => ({
        ...s,
        category_name: (s as any).category || "Servicio",
        duration: (s as any).duration || `${(s as any).duration_min} min`
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
    const results = await sql`
        INSERT INTO leads (organization_id, client_name, contact_info)
        VALUES (${orgId}, ${name}, ${contactInfo})
        RETURNING id
    `;
    return results[0];
}

export async function getAppointmentsForDate(dateStr: string) {
    console.log(`[db.ts] Checking appointments for date: ${dateStr}`);
    return await sql`SELECT date_time, staff_id FROM appointments WHERE date_time::date = ${dateStr} AND status != 'canceled'`;
}

export async function getStaffByCategory(categoryId: string) {
    console.log(`[db.ts] Fetching staff for category: ${categoryId}`);
    const results = await sql`
        SELECT s.* FROM staff s
        JOIN staff_specialties ss ON s.id = ss.staff_id
        WHERE s.is_active = true AND ss.category_id = ${categoryId}
    `;
    return results;
}

export async function getAllStaff() {
    const results = await sql`SELECT * FROM staff WHERE is_active = true`;
    return results;
}

export async function createAppointment(leadId: string, orgId: string, dateTime: string, catNames: string, price: number, duration: number, selectedServices: Service[]) {
    console.log(`[db.ts] Creating appointment for lead ${leadId} at ${dateTime}`);
    return await sql`
        INSERT INTO appointments (lead_id, organization_id, date_time, service_type, status, total_price, total_duration, selected_services)
        VALUES (${leadId}, ${orgId}, ${new Date(dateTime).toISOString()}, ${catNames}, 'confirmed', ${price.toString()}, ${duration}, ${JSON.stringify(selectedServices)}::jsonb)
    `;
}

export async function markLeadAsConverted(leadId: string) {
    console.log(`[db.ts] Marking lead ${leadId} as converted`);
    return await sql`UPDATE leads SET status = 'converted', updated_at = NOW() WHERE id = ${leadId}`;
}

export async function updateLeadState(leadId: string, state: ConvState) {
    console.log(`[db.ts] Updating lead ${leadId} current_state`);
    return await sql`UPDATE leads SET current_state = ${JSON.stringify(state)}::jsonb, updated_at = NOW() WHERE id = ${leadId}`;
}

export async function getAvailableSlotsFromDB(categoryId: string, startDate: Date, endDate: Date) {
    console.log(`[db.ts] Calling get_available_slots in DB for category: ${categoryId}`);
    // Use raw query for custom PG function
    const results = await sql`
        SELECT slot_time as "slot_time", professional_id as "staff_id"
        FROM get_available_slots(${categoryId}, ${startDate.toISOString()}, ${endDate.toISOString()}, 30)
        ORDER BY slot_time ASC
    `;
    return results as { slot_time: Date, staff_id: string }[];
}
