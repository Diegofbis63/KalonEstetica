import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, asc, desc, and, sql } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * N├ÜCLEO MAESTRO DE ADMINISTRACI├ôN K├éLON (v14)
 * Consolida: Auth, Users, Dashboard, Appointments, Income, Categories, Services, Staff.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const { section, type } = req.query;
    const sec = section as string;
    const catType = type as string;

    try {
        // --- PUBLIC GETS (Categories / Services for Landing) ---
        if (req.method === 'GET') {
            if (sec === 'catalogs' && catType === 'categories') {
                const results = await db.query.categories.findMany({
                    where: eq(schema.categories.active, true),
                    orderBy: [asc(schema.categories.sort_order), desc(schema.categories.created_at)]
                });
                return res.status(200).json({ categories: results });
            }

            if (sec === 'catalogs' && catType === 'services') {
                const { categoryId, categorySlug } = req.query;
                let effectiveId = categoryId as string;
                if (!effectiveId && categorySlug) {
                    const cat = await db.query.categories.findFirst({ where: eq(schema.categories.slug, categorySlug as string) });
                    if (cat) effectiveId = cat.id;
                }
                const where = effectiveId ? eq(schema.services.category_id, effectiveId) : undefined;
                const results = await db.query.services.findMany({
                    where,
                    orderBy: [asc(schema.services.sort_order), desc(schema.services.created_at)],
                    with: { category: true }
                });
                return res.status(200).json({ services: results.map(s => ({ ...s, duration: s.duration_min || 0 })) });
            }
        }

        // --- AUTH REQUIRED FOR EVERYTHING ELSE ---
        const user = await requireAuth(req, res);
        if (!user) return;

        // --- DASHBOARD / STATS ---
        if (sec === 'dashboard' && req.method === 'GET') {
            const [orders] = await db.select({ count: sql`count(*)` }).from(schema.appointments);
            const [rev] = await db.select({ total: sql`sum(amount)` }).from(schema.income);
            const [clients] = await db.select({ count: sql`count(*)` }).from(schema.clients);
            return res.status(200).json({
                stats: {
                    totalAppointments: Number(orders.count),
                    totalRevenue: Number(rev.total || 0),
                    totalClients: Number(clients.count),
                    activeStaff: 5 // Mock or count staff
                }
            });
        }

        // --- APPOINTMENTS ---
        if (sec === 'appointments') {
            if (req.method === 'GET') {
                const results = await db.query.appointments.findMany({
                    with: { client: true, service: true, staff: true },
                    orderBy: [desc(schema.appointments.start_time)]
                });
                return res.status(200).json({ appointments: results });
            }
            if (req.method === 'POST') {
                const [item] = await db.insert(schema.appointments).values(req.body).returning();
                return res.status(201).json({ appointment: item });
            }
            if (req.method === 'PUT' || req.method === 'PATCH') {
                const id = req.query.id as string;
                const [updated] = await db.update(schema.appointments).set(req.body).where(eq(schema.appointments.id, id)).returning();
                return res.status(200).json({ appointment: updated });
            }
        }

        // --- USERS / PROFILE ---
        if (sec === 'users') {
            if (req.method === 'GET') {
                const results = await db.query.users.findMany();
                return res.status(200).json({ users: results });
            }
            // Add POST/PUT logic if needed for user management
        }

        // --- INCOME / CASHFLOW ---
        if (sec === 'income') {
            if (req.method === 'GET') {
                const results = await db.query.income.findMany({ orderBy: [desc(schema.income.date)] });
                return res.status(200).json({ income: results });
            }
            if (req.method === 'POST') {
                const [item] = await db.insert(schema.income).values(req.body).returning();
                return res.status(201).json({ income: item });
            }
        }

        // --- CATALOGS ADMIN (POST/PUT/DELETE) ---
        if (sec === 'catalogs') {
            const table = catType === 'categories' ? schema.categories : (catType === 'services' ? schema.services : schema.staff);
            
            if (req.method === 'POST') {
                const [item] = await db.insert(table as any).values(req.body).returning();
                return res.status(201).json({ [catType.slice(0,-1)]: item });
            }
            
            if (req.method === 'PUT' || req.method === 'PATCH') {
                const id = req.query.id as string;
                const [item] = await db.update(table as any).set(req.body).where(eq((table as any).id, id)).returning();
                return res.status(200).json({ [catType.slice(0,-1)]: item });
            }

            if (req.method === 'DELETE') {
                const id = req.query.id as string;
                await db.delete(table as any).where(eq((table as any).id, id));
                return res.status(200).json({ success: true });
            }
        }

        return res.status(405).json({ error: 'Method not allowed or Section missing' });
    } catch (e) {
        console.error(`[ADMIN API ERROR] ${sec}:`, e);
        return res.status(500).json({ error: 'Internal Server Error', details: (e as Error).message });
    }
}
