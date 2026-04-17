import { z } from "zod";

export const PaginationSchema = z.object({
  total: z.number().default(0),
  limit: z.number().default(50),
  offset: z.number().default(0),
  hasMore: z.boolean().default(false),
});


// Helper for robust numeric coercion (handles strings like "30 min", null, undefined or NaN)
const coerceNumber = z.preprocess((val: unknown) => {
  if (val === null || val === undefined || val === '') return 0;
  const processed = typeof val === 'string' ? val.replace(/[^0-9.]/g, '') : val;
  const num = Number(processed);
  return isNaN(num) ? 0 : num;
}, z.number().default(0));

// Helper for robust string coercion (handles null/undefined)
const coerceString = (fallback: unknown = '') => z.preprocess((val: unknown) => {
  if (val === null || val === undefined) return typeof fallback === 'function' ? fallback() : fallback;
  return String(val);
}, z.string().default(fallback as string));

// --- CATEGORIES ---
export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
  description: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  price_list_url: z.string().optional().nullable(),
  active: z.boolean().optional().default(true),
  sort_order: coerceNumber.optional().default(0),
  services: z.array(z.lazy(() => ServiceSchema)).optional(),
});

export const CategoriesResponseSchema = z.object({
  categories: z.array(CategorySchema).default([]),
});

// --- SERVICES ---
export const ServiceSchema = z.object({
  id: z.string(),
  category_id: coerceString().nullable(),
  title: coerceString('Servicio'),
  description: coerceString().nullable(),
  price: coerceNumber,
  duration: coerceNumber,
  image_url: coerceString().nullable(),
  active: z.boolean().optional().default(true),
  sort_order: coerceNumber,
  category_name: coerceString('General').nullable(),
});

export const ServicesResponseSchema = z.object({
  services: z.array(ServiceSchema).default([]),
});

// --- APPOINTMENTS ---
export const AppointmentSchema = z.object({
  id: z.string(),
  lead_id: coerceString().nullable(),
  client_name: coerceString('Cliente'),
  phone: coerceString(''),
  service_type: coerceString('Servicio'),
  category_name: coerceString('General'),
  category_id: coerceString().nullable(),
  date_time: coerceString(() => new Date().toISOString()),
  status: coerceString('pending'),
  created_at: coerceString().nullable(),
  total_price: coerceNumber,
  total_duration: coerceNumber,
  selected_services: z.array(z.object({
    id: coerceString().optional(),
    title: coerceString('Sin título'),
    price: coerceNumber,
    duration: coerceNumber,
  })).optional().default([]),
  canManage: z.boolean().optional().default(true),
  is_bot_enabled: z.boolean().optional().default(true),
});

export const AppointmentsResponseSchema = z.object({
  appointments: z.array(AppointmentSchema).default([]),
  metadata: PaginationSchema.optional(),
});


// --- LEADS ---
export const LeadSchema = z.object({
  id: z.string(),
  client_name: coerceString('Cliente'),
  phone: coerceString(''),
  status: coerceString('new'),
  is_bot_enabled: z.boolean().optional().default(true),
  last_interaction: coerceString().nullable(),
  created_at: coerceString().nullable(),
  intent_score: coerceNumber,
  category_id: coerceString().nullable(),
  category_name: coerceString('General'),
  email: coerceString().nullable(),
  total_appointments: z.number().optional().default(0),
  pending_appointments: z.number().optional().default(0),
  total_spent: coerceNumber.optional().default(0),
  canManage: z.boolean().optional().default(true),
});

export const LeadsResponseSchema = z.object({
  leads: z.array(LeadSchema).default([]),
  metadata: PaginationSchema.optional(),
});

export const UserAccountSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email().optional().nullable(),
  role: z.string(),
  category_ids: z.array(z.string()).default([]),
});

export const UsersResponseSchema = z.object({
  users: z.array(UserAccountSchema).default([]),
});

// --- DASHBOARD ---
export const DashboardResponseSchema = z.object({
  leads: z.array(LeadSchema).default([]),
  appointments: z.array(AppointmentSchema).default([]),
  stats: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
});

// --- CLIENTS ---
export const ClientSchema = z.object({
  id: z.string(),
  client_name: coerceString('Cliente'),
  phone: coerceString(''),
  email: coerceString().nullable(),
  last_interaction: coerceString().nullable(),
  last_appointment: z.string().default(() => new Date().toISOString()),
  total_appointments: z.number().default(0),
  pending_appointments: z.number().optional().default(0),
  total_spent: z.number().default(0),
  note: z.string().nullish(),
  is_bot_enabled: z.boolean().default(true),
  intent_score: z.number().default(0),
  appointment_history: z.array(AppointmentSchema).optional().default([]),
});

export const ClientsResponseSchema = z.object({
  clients: z.array(ClientSchema).default([]),
  metadata: PaginationSchema.optional(),
});


// --- INCOME ---
export const PaymentSchema = z.object({
  id: z.string(),
  lead_id: coerceString().nullable(),
  client_name: coerceString('Cliente'),
  is_bot_enabled: z.boolean().optional().default(false),
  parent_service: coerceString('Servicio'),
  selected_services: z.array(z.object({
    title: coerceString('Servicio'),
    price: coerceNumber,
  })).optional().default([]),
  date: coerceString(() => new Date().toISOString()),
  amount: coerceNumber,
  status: coerceString('pending'),
  payment_method: coerceString('other'),
  phone: coerceString(''),
});

export const IncomeResponseSchema = z.object({
  stats: z.object({
    revenue: coerceNumber.default(0),
    ticket: coerceNumber.default(0),
    count: coerceNumber.default(0),
  }).default({ revenue: 0, ticket: 0, count: 0 }),
  evolution: z.array(z.object({
    date: z.string(),
    revenue: coerceNumber,
  })).default([]),
  payments: z.array(PaymentSchema).default([]),
});

// --- STAFF ---
export const StaffSchema = z.object({
  id: z.string(),
  name: z.string().optional().nullable().default('Staff Member'),
  phone: z.string().optional().nullable().default(''),
  role: z.string().optional().default('staff'),
  is_active: z.boolean().optional().default(true),
  work_start: z.string().optional().default('09:00'),
  work_end: z.string().optional().default('18:00'),
  specialties: z.array(z.string()).default([]),
});

export const StaffResponseSchema = z.object({
  staff: z.array(StaffSchema).default([]),
});

export type Category = z.infer<typeof CategorySchema>;
export type Service = z.infer<typeof ServiceSchema>;
export type Appointment = z.infer<typeof AppointmentSchema>;
export type Lead = z.infer<typeof LeadSchema>;
export type Client = z.infer<typeof ClientSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type UserAccount = z.infer<typeof UserAccountSchema>;
export type UsersResponse = z.infer<typeof UsersResponseSchema>;
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
export type CategoriesResponse = z.infer<typeof CategoriesResponseSchema>;
export type ServicesResponse = z.infer<typeof ServicesResponseSchema>;
export type ClientsResponse = z.infer<typeof ClientsResponseSchema>;
export type IncomeResponse = z.infer<typeof IncomeResponseSchema>;
export type Staff = z.infer<typeof StaffSchema>;
export type StaffResponse = z.infer<typeof StaffResponseSchema>;

/**
 * Robust fetch wrapper with Zod validation
 */
export async function safeFetch<T>(url: string, schema: z.ZodType<T>, defaultValue?: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`SafeFetch: ${url} returned ${res.status}`);
      return defaultValue ?? (schema.parse({}) as unknown as T);
    }
    const data = await res.json();
    return schema.parse(data);
  } catch (err) {
    console.error(`SafeFetch Error [${url}]:`, err);
    if (defaultValue !== undefined) return defaultValue;
    try {
      // Fallback to schema defaults
      return schema.parse({}) as unknown as T;
    } catch {
      // Final fallback if even schema.parse({}) fails (e.g. for arrays)
      try {
        return schema.parse([]) as unknown as T;
      } catch {
        return {} as T;
      }
    }
  }
}
