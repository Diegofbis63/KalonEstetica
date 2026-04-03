
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { z } from 'zod';
import * as schema from '../api/_services/schema.ts';
import { sql, eq, desc } from 'drizzle-orm';

// --- SCHEMAS (Updated for parity with src/lib/validations.ts) ---
const coerceNumber = z.coerce.number();

const LeadSchema = z.object({
  id: z.string(),
  client_name: z.string().optional().nullable().default('Cliente'),
  phone: z.string().optional().nullable().default(''),
  email: z.string().optional().nullable(),
  status: z.string().optional().nullable().default('new'),
  intent_score: coerceNumber.optional().nullable().default(0),
  category_id: z.string().optional().nullable(),
  category_name: z.string().optional().nullable().default('General'),
  created_at: z.string().optional().nullable().default(() => new Date().toISOString()),
  updated_at: z.string().optional().nullable(),
  is_bot_enabled: z.boolean().optional().default(true),
  canManage: z.boolean().optional().default(true),
});

const AppointmentSchema = z.object({
  id: z.string(),
  lead_id: z.string().optional().nullable(),
  client_name: z.string().optional().nullable().default('Cliente'),
  phone: z.string().optional().nullable().default(''),
  service_type: z.string().optional().nullable().default('Servicio'),
  category_name: z.string().optional().nullable().default('Sin categoría'),
  category_id: z.string().optional().nullable(),
  date_time: z.string().optional().nullable().default(() => new Date().toISOString()),
  status: z.string().optional().nullable().default('pending'),
  created_at: z.string().optional().nullable(),
  total_price: coerceNumber.optional().nullable().default(0),
  total_duration: coerceNumber.optional().nullable().default(0),
  selected_services: z.array(z.object({
    id: z.string().optional(),
    title: z.string().optional().default('Sin título'),
    price: coerceNumber.optional().nullable().default(0),
    duration: coerceNumber.optional().nullable().default(0),
  })).optional().default([]),
  canManage: z.boolean().optional().default(true),
  is_bot_enabled: z.boolean().optional().default(true),
});

const DashboardResponseSchema = z.object({
  leads: z.array(LeadSchema).default([]),
  appointments: z.array(AppointmentSchema).default([]),
  stats: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
});

// --- EXECUTION ---
async function diagnose() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL missing');
    return;
  }

  const sqlClient = neon(url);
  const db = drizzle(sqlClient, { schema });

  console.log('--- DIAGNOSTIC: Dashboard API (Production) ---');

  try {
    // 1. Leads Query
    console.log('\n[1] Testing Leads Query...');
    const dashboardLeads = await db.select({
        id: schema.leads.id,
        client_name: sql<string>`COALESCE(${schema.leads.client_name}, 'Cliente sin nombre')`,
        phone: schema.leads.phone,
        status: schema.leads.status,
        is_bot_enabled: sql<boolean>`COALESCE(${schema.leads.is_bot_enabled}, true)`,
        created_at: schema.leads.created_at,
        intent_score: schema.leads.intent_score,
        category_id: schema.leads.category_id,
        category_name: schema.categories.name,
        updated_at: schema.leads.updated_at,
        canManage: sql<boolean>`true`
    })
    .from(schema.leads)
    .leftJoin(schema.categories, eq(schema.leads.category_id, schema.categories.id))
    .limit(5);

    const formattedLeads = dashboardLeads.map(l => ({
        ...l,
        created_at: l.created_at ? new Date(l.created_at).toISOString() : undefined,
        updated_at: l.updated_at ? new Date(l.updated_at).toISOString() : null,
    }));

    const leadParse = z.array(LeadSchema).safeParse(formattedLeads);
    if (!leadParse.success) {
        console.error('❌ Lead Validation Failed:');
        console.error(JSON.stringify(leadParse.error.format(), null, 2));
    } else {
        console.log('✅ Leads Validation Passed');
    }

    // 2. Appointments Query
    console.log('\n[2] Testing Appointments Query...');
    const dashboardAppointments = await db.select({
        id: schema.appointments.id,
        lead_id: schema.appointments.lead_id,
        client_name: schema.leads.client_name,
        phone: schema.leads.phone,
        service_type: schema.appointments.service_type,
        category_name: schema.categories.name,
        category_id: schema.appointments.category_id,
        date_time: schema.appointments.date_time,
        status: schema.appointments.status,
        created_at: schema.appointments.created_at,
        total_price: schema.appointments.total_price,
        total_duration: schema.appointments.total_duration,
        selected_services: schema.appointments.selected_services,
        is_bot_enabled: schema.leads.is_bot_enabled
    })
    .from(schema.appointments)
    .leftJoin(schema.leads, eq(schema.appointments.lead_id, schema.leads.id))
    .leftJoin(schema.categories, eq(schema.appointments.category_id, schema.categories.id))
    .limit(50);

    const formattedAppts = dashboardAppointments.map(a => ({
        ...a,
        date_time: a.date_time ? new Date(a.date_time).toISOString() : undefined,
        created_at: a.created_at ? new Date(a.created_at).toISOString() : undefined,
        total_price: Number(a.total_price || 0),
        total_duration: Number(a.total_duration || 0),
        selected_services: Array.isArray(a.selected_services) ? (a.selected_services as any[]).map((s: any) => ({
            ...s,
            price: s.price ? Number(s.price) : 0,
            duration: s.duration ? parseInt(String(s.duration).replace(/\D/g, ''), 10) || 0 : null
        })) : []
    }));

    const apptParse = z.array(AppointmentSchema).safeParse(formattedAppts);
    if (!apptParse.success) {
        console.error('❌ Appointment Validation Failed:');
        // Log the first failing item to see why
        const issues = apptParse.error.issues;
        issues.forEach(issue => {
            const index = issue.path[0];
            console.error(`Issue at index ${index}, field ${issue.path[1]}: ${issue.message}`);
            console.error('Data causing issue:', JSON.stringify(formattedAppts[index as number], null, 2));
        });
    } else {
        console.log('✅ Appointments Validation Passed');
    }

  } catch (err) {
    console.error('Fatal Script Error:', err);
  }
}

diagnose();
