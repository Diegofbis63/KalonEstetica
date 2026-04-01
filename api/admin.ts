import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, asc, desc, and, sql } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-nova-estetica-key';

/**
 * NÚCLEO MAESTRO DE ADMINISTRACIÓN KÂLON (v14)
 * Consolida: Auth, Users, Dashboard, Appointments, Income, Categories, Services, Staff.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const { section, type } = req.query;
    const sec = section as string;
    const catType = type as string;

    try {
        // --- 1. PUBLIC GETS (Categories / Services for Landing) ---
        // This is temporarily simplified for landing page requests that don't pass 'section'
        if (req.method === 'GET' && !section) {
            const results = await db.query.categories.findMany({ 
                with: { services: true },
                orderBy: [sql`sort_order ASC`]
            });
            return res.status(200).json({ categories: results });
        }

        // --- 2. AUTHENTICATION (POST /api/admin?section=auth) ---
        if (sec === 'auth' && req.method === 'POST') {
            const { username, password } = req.body;
            
            // Buscar usuario
            const user = await db.query.admin_users.findFirst({
                where: eq(schema.admin_users.username, username)
            });

            if (!user) {
                return res.status(401).json({ error: 'Usuario no encontrado' });
            }

            // Verificar password (bcrypt hash o raw fallback si no hay hash)
            let isMatch = false;
            if (user.password_hash && user.password_hash.startsWith('$2')) {
                isMatch = await bcrypt.compare(password, user.password_hash);
            } else {
                // Fallback para usuarios legacy o raw_password si existe
                isMatch = (password === user.password_hash) || (password === user.raw_password);
            }

            if (!isMatch) {
                return res.status(401).json({ error: 'Credenciales inválidas' });
            }

            // Generar Token
            const token = jwt.sign({ 
                id: user.id, 
                username: user.username, 
                role: user.role 
            }, JWT_SECRET, { expiresIn: '24h' });

            // Set Cookie
            res.setHeader('Set-Cookie', cookie.serialize('nova_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 60 * 60 * 24, // 24 hours
                path: '/',
            }));

            return res.status(200).json({ 
                success: true, 
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    email: user.email
                }
            });
        }

        // --- 3. AUTH REQUIRED FOR EVERYTHING ELSE ---
        const user = await requireAuth(req, res);
        if (!user) return;

        // --- DASHBOARD / STATS ---
        if (sec === 'dashboard' && req.method === 'GET') {
            const [ordersCount] = await db.select({ count: sql`count(*)` }).from(schema.appointments);
            const [leadsCount] = await db.select({ count: sql`count(*)` }).from(schema.leads);
            const incomeRes = await db.select({ total: sql`sum(total_price)` }).from(schema.appointments);

            // Fetch leads for dashboard table
            const dashboardLeads = await db.select({
                id: schema.leads.id,
                client_name: sql<string>`COALESCE(${schema.leads.client_name}, 'Cliente sin nombre')`,
                phone: schema.leads.phone,
                status: schema.leads.status,
                is_bot_enabled: sql<boolean>`COALESCE(${schema.leads.is_bot_enabled}, true)`,
                created_at: schema.leads.created_at,
                intent_score: schema.leads.intent_score,
                category_id: schema.leads.category_id,
                updated_at: schema.leads.updated_at
            })
            .from(schema.leads)
            .orderBy(desc(schema.leads.last_interaction))
            .limit(50);

            // Fetch appointments for dashboard table
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
                is_bot_enabled: sql<boolean>`COALESCE(${schema.leads.is_bot_enabled}, false)`
            })
            .from(schema.appointments)
            .leftJoin(schema.leads, eq(schema.appointments.lead_id, schema.leads.id))
            .leftJoin(schema.categories, eq(schema.appointments.category_id, schema.categories.id))
            .orderBy(desc(schema.appointments.date_time))
            .limit(50);

            return res.status(200).json({
                leads: dashboardLeads,
                appointments: dashboardAppointments,
                stats: {
                    totalAppointments: Number(ordersCount.count),
                    totalRevenue: Number(incomeRes[0]?.total || 0),
                    totalClients: Number(leadsCount.count),
                    activeStaff: 5
                }
            });
        }

        // --- APPOINTMENTS ---
        if (sec === 'appointments') {
            if (req.method === 'GET') {
                const results = await db.select({
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
                    is_bot_enabled: sql<boolean>`COALESCE(${schema.leads.is_bot_enabled}, false)`
                })
                .from(schema.appointments)
                .leftJoin(schema.leads, eq(schema.appointments.lead_id, schema.leads.id))
                .leftJoin(schema.categories, eq(schema.appointments.category_id, schema.categories.id))
                .orderBy(desc(schema.appointments.date_time));

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
                const results = await db.query.admin_users.findMany();
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
            
            if (req.method === 'GET') {
                const findOptions: any = {
                    orderBy: [(table as any).sort_order ? sql`sort_order ASC` : (table as any).created_at ? desc((table as any).created_at) : undefined]
                };

                // Add relations if needed
                if (catType === 'staff') {
                    findOptions.with = { specialties: true };
                } else if (catType === 'categories') {
                    findOptions.with = { services: true };
                }

                const results = await (db.query as any)[catType].findMany(findOptions);

                // Format results
                let formatted = results;
                if (catType === 'services') {
                    formatted = results.map((s: any) => ({ ...s, price: s.price ? Number(s.price) : null }));
                } else if (catType === 'staff') {
                    // Map specialties to array of category IDs
                    formatted = results.map((s: any) => ({
                        ...s,
                        specialties: s.specialties?.map((sp: any) => sp.category_id) || []
                    }));
                }

                return res.status(200).json({ [catType]: formatted });
            }

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
