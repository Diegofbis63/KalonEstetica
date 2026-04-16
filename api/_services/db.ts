import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';
import { eq, and, sql as drizzleSql, asc, desc, like, or } from 'drizzle-orm';
import type { ConvState, Category, Service } from './schema.js';


export interface ContactInfo {
    phone: string;
    source: string;
    initId?: string | null;
}

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
    console.error("[db.ts] CRITICAL: Database connection string is missing!");
}

// Inicialización diferida o protegida para evitar crashes en el Edge
export const sql = connectionString ? neon(connectionString) : null as any;
export const db = connectionString ? drizzle(sql, { schema }) : null as any;

/**
 * Helper para guardar logs de chat de forma asíncrona.
 */
export async function saveChatLog(leadId: string, role: 'user' | 'assistant', content: string) {
    if (!db || !leadId) return;
    try {
        await db.insert(schema.chat_logs).values({
            lead_id: leadId,
            role,
            content,
            created_at: new Date()
        });
    } catch (e) {
        console.error(`[db.ts] Error saving chat log:`, e);
    }
}

// --- HELPERS ---
const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
    let timer: any;
    const timeoutPromise = new Promise<T>((resolve) => {
        timer = setTimeout(() => {
            console.warn(`[db.ts] TIMEOUT: Operation exceeded ${ms}ms. Falling back.`);
            resolve(fallback);
        }, ms);
    });

    return Promise.race([
        promise.then((res) => {
            if (timer) clearTimeout(timer);
            return res;
        }),
        timeoutPromise
    ]);
};

// --- CATEGORIES ---
export async function getCategories(): Promise<Category[]> {
    console.log("[db.ts] Fetching categories...");
    const results = await withTimeout(
        db.query.categories.findMany({
            where: eq(schema.categories.active, true),
            orderBy: [asc(schema.categories.sort_order)]
        }),
        5000, []
    );
    return results as unknown as Category[];
}

// --- SERVICES ---
export async function getActiveServices(): Promise<Service[]> {
    console.log("[db.ts] Fetching active services...");
    const results = await withTimeout(
        db.query.services.findMany({
            where: eq(schema.services.active, true),
            with: { category: true },
            orderBy: [asc(schema.services.sort_order)]
        }),
        5000, [] as (typeof schema.services.$inferSelect & { category: typeof schema.categories.$inferSelect })[]
    );
    
    return results.map(s => ({
        ...s,
        category_name: s.category?.name || "Servicio",
        duration: s.duration || `${s.duration_min} min`
    })) as unknown as Service[];
}

export async function getServicesByCategory(categoryNameOrId: string): Promise<Service[]> {
    console.log(`[DB CRITICAL] Fetching services for category input: "${categoryNameOrId}"`);
    
    // Primero buscamos la categoría (exacta o por nombre similar o numérica)
    const normalized = categoryNameOrId.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const isNumeric = /^\d+$/.test(normalized);
    const numericIndex = isNumeric ? parseInt(normalized) : -1;

    const cats = await getCategories();
    console.log(`[DB CRITICAL] Total active categories found: ${cats.length}`);

    const match = cats.find((c, index) => {
        const catNormalized = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return (
            c.id === categoryNameOrId || 
            catNormalized.includes(normalized) ||
            (numericIndex !== -1 && (index + 1 === numericIndex || c.sort_order === numericIndex))
        );
    });

    if (!match) {
        console.warn(`[DB CRITICAL] NO MATCH FOUND for input: "${categoryNameOrId}"`);
        return [];
    }

    console.log(`[DB CRITICAL] MATCH FOUND: ${match.name} (ID: ${match.id})`);

    const results = await withTimeout(
        db.query.services.findMany({
            where: and(eq(schema.services.active, true), eq(schema.services.category_id, match.id)),
            orderBy: [asc(schema.services.sort_order)]
        }),
        5000, []
    );

    console.log(`[DB CRITICAL] SERVICES FOUND for ${match.name}: ${results.length}`);

    const services = results.map(s => ({
        ...s,
        category_name: match.name,
        duration: s.duration || `${s.duration_min} min`
    })) as unknown as Service[];

    return {
        services,
        category: match
    } as any;
}

// --- LEADS ---
export async function getLeadByPhone(phone: string) {
    console.log(`[db.ts] Searching lead by phone: ${phone}`);
    const normalized = phone.replace(/\D/g, '');
    
    const results = await withTimeout(
        db.select().from(schema.leads)
            .where(drizzleSql`regexp_replace(${schema.leads.contact_info}->>'phone', '\\D', '', 'g') LIKE ${'%' + normalized}`)
            .limit(1),
        7000, []
    );
        
    return results.length > 0 ? results[0] : null;
}

export async function findLeadByInitId(initId: string) {
    if (!initId || initId.length < 5) return null;
    console.log(`[db.ts] Searching lead by initId: ${initId}`);
    
    // Usamos findFirst que es más eficiente en Neon
    const result = await withTimeout(
        db.query.leads.findFirst({
            where: drizzleSql`(${schema.leads.contact_info}->>'initId') = ${initId}`
        }),
        7500, // 7.5s timeout para tolerar cold start
        null
    );
        
    return result;
}

export async function getChatHistory(leadId: string) {
    console.log(`[db.ts] Fetching chat history for lead: ${leadId}`);
    return await withTimeout(
        db.query.chat_logs.findMany({
            where: eq(schema.chat_logs.lead_id, leadId),
            orderBy: [asc(schema.chat_logs.created_at)]
        }),
        3000, []
    );
}

export async function createLead(orgId: string | null, name: string, contactInfo: ContactInfo) {
    console.log(`[db.ts] Creating a new lead for: ${name}`);
    const results = await withTimeout(
        db.insert(schema.leads).values({
            organization_id: orgId || null,
            client_name: name,
            contact_info: contactInfo,
            status: 'new',
            is_bot_enabled: true,
            chat_history: []
        }).returning({ id: schema.leads.id }),
        8000, []
    );
    
    return results[0] || null;
}

// --- UPDATES ---
export async function updateLeadState(leadId: string, state: ConvState) {
    console.log(`[db.ts] Updating lead ${leadId} current_state`);
    return await withTimeout(
        db.update(schema.leads)
            .set({ current_state: state, updated_at: new Date() })
            .where(eq(schema.leads.id, leadId)),
        3000, null
    );
}

// --- SLOTS ---
export async function getAvailableSlotsFromDB(categoryId: string, startDate: Date, endDate: Date): Promise<any[]> {
    console.log(`[db.ts] Calling availability DB for category: ${categoryId}`);
    const query = drizzleSql`
        SELECT slot_time as "slot_time", professional_id as "staff_id"
        FROM get_available_slots(${categoryId}, ${startDate.toISOString()}, ${endDate.toISOString()}, 30)
        ORDER BY slot_time ASC
    `;
    const results = await withTimeout(db.execute(query), 5000, { 
        rows: [] as Record<string, unknown>[],
        fields: [],
        command: 'SELECT',
        rowCount: 0,
        rowAsArray: false
    } as any);
    return results.rows || [];
}

export async function createAppointment(leadId: string, orgId: string | null, dateTime: string, catNames: string, price: number, duration: number, selectedServices: Service[]) {
    console.log(`[db.ts] Creating appointment for lead ${leadId}`);
    return await withTimeout(
        db.insert(schema.appointments).values({
            lead_id: leadId,
            organization_id: orgId || null,
            date_time: new Date(dateTime),
            service_type: catNames,
            status: 'confirmed',
            total_price: price.toString(),
            total_duration: duration,
            selected_services: selectedServices
        }),
        4000, null
    );
}

export async function getStaffByCategory(categoryId: string) {
    console.log(`[db.ts] Fetching staff for category: ${categoryId}`);
    const results = await withTimeout(
        db.select({ id: schema.staff.id, name: schema.staff.name })
            .from(schema.staff)
            .innerJoin(schema.staff_specialties, eq(schema.staff.id, schema.staff_specialties.staff_id))
            .where(and(eq(schema.staff_specialties.category_id, categoryId), eq(schema.staff.is_active, true))),
        3000, []
    );
    return results;
}
