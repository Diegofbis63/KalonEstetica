import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, asc, desc, and, sql, inArray } from 'drizzle-orm';
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
            
            // Fix: total_price is numeric. cast to text nullif can fail. simplification is safer and better.
            const statsIncome = await db.select({
                total: sql<string>`SUM(COALESCE(${schema.appointments.total_price}, 0))`,
                count: sql`count(*)`
            })
                .from(schema.appointments)
                .where(inArray(sql<string>`lower(${schema.appointments.status})`, [
                    'realizada', 'concluida', 'pagada', 'confirmed', 'completada', 'completado', 'finalizada', 'servido'
                ]));

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
                leads: dashboardLeads.map(l => ({
                    ...l,
                    created_at: l.created_at ? new Date(l.created_at).toISOString() : undefined,
                    updated_at: l.updated_at ? new Date(l.updated_at).toISOString() : null,
                })),
                appointments: dashboardAppointments.map(a => ({
                    ...a,
                    date_time: a.date_time ? new Date(a.date_time).toISOString() : undefined,
                    created_at: a.created_at ? new Date(a.created_at).toISOString() : undefined,
                    total_price: Number(a.total_price || 0),
                    total_duration: Number(a.total_duration || 0),
                    selected_services: Array.isArray(a.selected_services) ? (a.selected_services as any[]).map((s: any) => ({
                        ...s,
                        price: s.price ? Number(s.price) : null,
                        duration: s.duration ? parseInt(String(s.duration).replace(/\D/g, ''), 10) || 0 : null
                    })) : []
                })),
                stats: {
                    totalAppointments: Number(ordersCount.count),
                    totalRevenue: Number(statsIncome[0]?.total || 0),
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

                return res.status(200).json({
                    appointments: results.map(a => ({
                        ...a,
                        date_time: a.date_time ? new Date(a.date_time).toISOString() : undefined,
                        created_at: a.created_at ? new Date(a.created_at).toISOString() : undefined,
                        total_price: Number(a.total_price || 0),
                        total_duration: Number(a.total_duration || 0),
                        selected_services: Array.isArray(a.selected_services) ? (a.selected_services as any[]).map((s: any) => ({
                            ...s,
                            price: s.price ? Number(s.price) : null,
                            duration: s.duration ? parseInt(String(s.duration).replace(/\D/g, ''), 10) || 0 : null
                        })) : []
                    }))
                });
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
                const results = await db.select({
                    id: schema.appointments.id,
                    lead_id: schema.appointments.lead_id,
                    client_name: schema.leads.client_name,
                    phone: schema.leads.phone,
                    service_type: schema.appointments.service_type,
                    category_name: schema.categories.name,
                    date_time: schema.appointments.date_time,
                    status: schema.appointments.status,
                    total_price: schema.appointments.total_price,
                    selected_services: schema.appointments.selected_services,
                    is_bot_enabled: sql<boolean>`COALESCE(${schema.leads.is_bot_enabled}, false)`
                })
                .from(schema.appointments)
                .leftJoin(schema.leads, eq(schema.appointments.lead_id, schema.leads.id))
                .leftJoin(schema.categories, eq(schema.appointments.category_id, schema.categories.id))
                .where(inArray(sql<string>`lower(${schema.appointments.status})`, [
                    'realizada', 'concluida', 'pagada', 'confirmed', 'completada', 'completado', 'finalizada', 'servido'
                ]))
                .orderBy(desc(schema.appointments.date_time));
                
                const totalRevenueVal = results.reduce((acc, a) => acc + Number(a.total_price || 0), 0);
                const count = results.length;
                const evolutionMap: Record<string, number> = {};
                
                const payments = results.map(a => {
                    const amount = Number(a.total_price || 0);
                    if (a.date_time) {
                         const dateObj = new Date(a.date_time);
                         const monthKey = dateObj.toLocaleString('es-ES', { month: 'short' }).charAt(0).toUpperCase() + dateObj.toLocaleString('es-ES', { month: 'short' }).slice(1);
                         evolutionMap[monthKey] = (evolutionMap[monthKey] || 0) + Number(a.total_price || 0);
                    }
                    
                    return {
                        id: a.id,
                        lead_id: a.lead_id,
                        client_name: a.client_name || 'Cliente sin nombre',
                        is_bot_enabled: a.is_bot_enabled,
                        parent_service: a.category_name || a.service_type,
                        selected_services: Array.isArray(a.selected_services) ? a.selected_services.map((s: any) => ({
                            title: s.title || 'Servicio',
                            price: s.price ? Number(s.price) : 0,
                            duration: s.duration ? parseInt(String(s.duration).replace(/\D/g, ''), 10) || 0 : null
                        })) : [],
                        date: a.date_time ? new Date(a.date_time).toISOString() : new Date().toISOString(),
                        amount: amount,
                        status: 'completado',
                        payment_method: 'Efectivo', // Default as we dont have payment_method tracking currently
                        phone: a.phone
                    };
                });
                
                const evolution = Object.keys(evolutionMap).map(name => ({
                    name,
                    Facturado: evolutionMap[name]
                }));

                // Ensure at least some empty months if data is totally empty
                if (evolution.length === 0) {
                    evolution.push({ name: 'Mes Actual', Facturado: 0 });
                }

                return res.status(200).json({
                    stats: {
                        revenue: totalRevenueVal,
                        ticket: count > 0 ? Math.round(totalRevenueVal / count) : 0,
                        count: count
                    },
                    evolution,
                    payments
                });
            }
        }

        // --- CATALOGS ADMIN (POST/PUT/DELETE) ---
        if (sec === 'catalogs') {
            const table = catType === 'categories' ? schema.categories : (catType === 'services' ? schema.services : schema.staff);
            const categoryId = req.query.categoryId as string;
            
            if (req.method === 'GET') {
                const findOptions: any = {
                    orderBy: []
                };

                // Better sorting logic
                if ((table as any).sort_order) {
                    findOptions.orderBy.push(asc((table as any).sort_order));
                } else if ((table as any).created_at) {
                    findOptions.orderBy.push(desc((table as any).created_at));
                }

                // Add relations and filters
                if (catType === 'staff') {
                    findOptions.with = { specialties: true };
                } else if (catType === 'categories') {
                    findOptions.with = { services: true };
                } else if (catType === 'services' && categoryId) {
                    findOptions.where = eq(schema.services.category_id, categoryId);
                }

                const results = await (db.query as any)[catType].findMany(findOptions);

                // Format results
                let formatted = results;
                if (catType === 'services') {
                    formatted = results.map((s: any) => ({ 
                        ...s, 
                        price: s.price ? Number(s.price) : null,
                        duration: s.duration_min ? Number(s.duration_min) : (s.duration ? parseInt(String(s.duration).replace(/\D/g, ''), 10) || 0 : null)
                    }));
                } else if (catType === 'categories') {
                    formatted = results.map((c: any) => ({
                        ...c,
                        services: c.services?.map((s: any) => ({
                            ...s,
                            price: s.price ? Number(s.price) : null,
                            duration: s.duration_min ? Number(s.duration_min) : (s.duration ? parseInt(String(s.duration).replace(/\D/g, ''), 10) || 0 : null)
                        }))
                    }));
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
