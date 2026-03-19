import { z } from "zod";

// --- CATEGORIES ---
export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
  description: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  active: z.boolean().optional().default(true),
  sort_order: z.number().optional().default(0),
});

export const CategoriesResponseSchema = z.object({
  categories: z.array(CategorySchema).default([]),
});

// --- SERVICES ---
export const ServiceSchema = z.object({
  id: z.string(),
  category_id: z.string().optional().nullable(),
  title: z.string(),
  description: z.string().optional().nullable(),
  price: z.coerce.string(),
  duration: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  active: z.boolean().optional().default(true),
  sort_order: z.number().optional().default(0),
  category_name: z.string().optional().nullable(),
});

export const ServicesResponseSchema = z.object({
  services: z.array(ServiceSchema).default([]),
});

// --- APPOINTMENTS ---
export const AppointmentSchema = z.object({
  id: z.string(),
  lead_id: z.string().optional().nullable(),
  client_name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  service_type: z.string().optional().nullable(),
  category_name: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  date_time: z.string(),
  status: z.string().default('pending'),
  created_at: z.string().optional(),
  total_price: z.number().optional().nullable(),
  total_duration: z.number().optional().nullable(),
  selected_services: z.array(z.object({
    id: z.string().optional(),
    title: z.string().optional(),
    price: z.number().optional().nullable(),
    duration: z.number().optional().nullable(),
  })).optional().default([]),
  canManage: z.boolean().optional().default(true),
  is_bot_enabled: z.boolean().optional().default(false),
});

export const AppointmentsResponseSchema = z.object({
  appointments: z.array(AppointmentSchema).default([]),
});

// --- LEADS ---
export const LeadSchema = z.object({
  id: z.string(),
  client_name: z.string(),
  phone: z.string().optional().nullable(),
  status: z.string().default('draft'),
  intent_score: z.number().default(0),
  category_id: z.string().optional().nullable(),
  category_name: z.string().optional().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional().nullable(),
  is_bot_enabled: z.boolean().default(true),
  canManage: z.boolean().optional().default(true),
});

export const LeadsResponseSchema = z.object({
  leads: z.array(LeadSchema).default([]),
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
  client_name: z.string(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  is_bot_enabled: z.boolean().optional().default(false),
  total_appointments: z.coerce.number().default(0),
  last_appointment: z.string().optional().nullable(),
  appointment_history: z.array(z.object({
    id: z.string(),
    date_time: z.string(),
    service_type: z.string(),
    status: z.string(),
  })).optional().default([]),
});

export const ClientsResponseSchema = z.object({
  clients: z.array(ClientSchema).default([]),
});

// --- INCOME ---
export const PaymentSchema = z.object({
  id: z.string(),
  lead_id: z.string().optional().nullable(),
  client_name: z.string(),
  is_bot_enabled: z.boolean().optional().default(false),
  parent_service: z.string().optional().nullable(),
  selected_services: z.array(z.object({
    title: z.string(),
    price: z.coerce.number(),
  })).optional().default([]),
  date: z.string(),
  amount: z.coerce.number(),
  status: z.string(),
  payment_method: z.string(),
  phone: z.string().optional().nullable(),
});

export const IncomeResponseSchema = z.object({
  stats: z.object({
    revenue: z.number().default(0),
    ticket: z.number().default(0),
    count: z.number().default(0),
  }).default({ revenue: 0, ticket: 0, count: 0 }),
  evolution: z.array(z.object({
    date: z.string(),
    revenue: z.number(),
  })).default([]),
  payments: z.array(PaymentSchema).default([]),
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

/**
 * Robust fetch wrapper with Zod validation
 */
export async function safeFetch<T>(url: string, schema: z.ZodType<T>, defaultValue?: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`SafeFetch: ${url} returned ${res.status}`);
      return defaultValue ?? (schema.parse([]) as unknown as T); // Try to parse empty array if possible
    }
    const data = await res.json();
    const result = schema.safeParse(data);
    if (!result.success) {
      console.error(`SafeFetch Validation Error for ${url}:`, result.error);
      return defaultValue ?? (schema.parse({}) as unknown as T); // Try to parse empty object if possible
    }
    return result.data;
  } catch (error) {
    console.error(`SafeFetch Network Error for ${url}:`, error);
    // Be very careful here. If defaultValue is undefined, we need a safe fallback.
    // Given our schemas use .default([]), .parse({}) usually works to get those defaults.
    try {
        return defaultValue ?? (schema.parse({}) as unknown as T);
    } catch {
        return defaultValue as T;
    }
  }
}
