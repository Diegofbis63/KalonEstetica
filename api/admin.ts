import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { requireAuth } from '../utils/auth.js';
import { eq, asc, desc, and, sql, inArray, count } from 'drizzle-orm';
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
    
    const { section, type, limit: qLimit, offset: qOffset, date: qDate } = req.query;
    const limit = Math.min(Number(qLimit || 50), 100);
    const offset = Number(qOffset || 0);
    const sec = section as string;
    const catType = type as string;
    const reqDateGeneral = qDate as string;

    try {
        // --- 1. PUBLIC GETS (Categories / Services for Landing) ---
        // This is temporarily simplified for landing page requests that don't pass 'section'
        // --- 1. PUBLIC GET HANDLERS (No Auth Required) ---
        // Allow landing page, bot, and admin dashboard to fetch catalogs safely
        if (req.method === 'GET' && (!section || section === 'catalogs')) {
            const catalogType = (type || 'categories') as string;
            
            // Validate catalog type
            if (!['categories', 'services', 'staff'].includes(catalogType)) {
                if (!section) {
                    const results = await db.query.categories.findMany({ 
                        with: { services: true },
                        orderBy: [asc(schema.categories.sort_order)]
                    });
                    return res.status(200).json({ categories: results });
                }
                return res.status(400).json({ error: 'Invalid catalog type' });
            }

            const table = catalogType === 'categories' ? schema.categories : (catalogType === 'services' ? schema.services : schema.staff);
            
            const findOptions: any = {
                orderBy: []
            };

            if ((table as any).sort_order) {
                findOptions.orderBy.push(asc((table as any).sort_order));
            } else if ((table as any).created_at) {
                findOptions.orderBy.push(desc((table as any).created_at));
            }

            if (catalogType === 'categories') {
                findOptions.with = { services: true };
            } else if (catalogType === 'staff') {
                findOptions.with = { specialties: true };
            }

            const rawCategoryId = (req.query.categoryId || req.query.category_id) as string;
            if (catalogType === 'services' && rawCategoryId) {
                findOptions.where = eq(schema.services.category_id, rawCategoryId);
            }

            const results = await (db.query as any)[catalogType].findMany(findOptions);
            
            console.log(`[admin API] ${catalogType} query results: ${results?.length || 0}`);

            const safeNum = (v: any) => {
                if (v === null || v === undefined) return 0;
                const n = Number(String(v).replace(/[^0-9.]/g, ''));
                return isNaN(n) ? 0 : n;
            };

            let formatted = results;
            if (catalogType === 'services') {
                formatted = results.map((s: any) => {
                    const dMin = safeNum(s.duration_min || s.duration);
                    return {
                        ...s,
                        title: s.title || s.name || 'Servicio',
                        name: s.name || s.title || 'Servicio',
                        price: safeNum(s.price),
                        duration_min: dMin,
                        duration: s.duration || `${dMin} min`,
                        sort_order: safeNum(s.sort_order)
                    };
                });
            } else if (catalogType === 'categories') {
                formatted = results.map((c: any) => ({
                    ...c,
                    services: (c.services || []).map((s: any) => {
                        const dMin = safeNum(s.duration_min || s.duration);
                        return {
                            ...s,
                            title: s.title || s.name || 'Servicio',
                            name: s.name || s.title || 'Servicio',
                            price: safeNum(s.price),
                            duration_min: dMin,
                            duration: s.duration || `${dMin} min`
                        };
                    })
                }));
            } else if (catalogType === 'staff') {
                formatted = results.map((s: any) => ({
                    ...s,
                    is_active: s.is_active ?? s.active ?? true,
                    specialties: s.specialties?.map((sp: any) => String(sp.category_id)) || []
                }));
            }

            console.log(`[admin API] Returning ${formatted?.length || 0} ${catalogType}`);
            return res.status(200).json({ [catalogType]: formatted });
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
            
            const dateFilter = sql`1=1`;
            const statsIncome = await db.select({
                total: sql<number>`SUM(COALESCE(${schema.appointments.total_price}, 0))`,
                count: sql<number>`COUNT(*)`
            })
            .from(schema.appointments)
            .where(and(
                sql`LOWER(${schema.appointments.status}) IN ('realizada', 'concluida', 'pagada', 'confirmed', 'completada', 'completado', 'finalizada', 'servido', 'completed')`,
                dateFilter
            ));

            const incomeData = statsIncome[0] || { total: 0, count: 0 };

            // Fetch leads for dashboard table
            const dashboardLeads = await db.select({
                id: schema.leads.id,
                client_name: sql<string>`COALESCE(${schema.leads.client_name}, 'Cliente sin nombre')`,
                phone: sql<string>`COALESCE(${schema.leads.phone}, '')`,
                status: sql<string>`COALESCE(${schema.leads.status}, 'new')`,
                is_bot_enabled: sql<boolean>`COALESCE(${schema.leads.is_bot_enabled}, true)`,
                created_at: schema.leads.created_at,
                intent_score: sql<number>`COALESCE(${schema.leads.intent_score}, 0)`,
                category_id: schema.leads.category_id,
                category_name: sql<string>`COALESCE(${schema.categories.name}, 'General')`,
                updated_at: schema.leads.updated_at,
                canManage: sql<boolean>`true`
            })
            .from(schema.leads)
            .leftJoin(schema.categories, eq(schema.leads.category_id, schema.categories.id))
            .orderBy(desc(schema.leads.last_interaction))
            .limit(15);

            const conds = [];
            conds.push(sql`LOWER(${schema.appointments.status}) NOT IN ('cancelled', 'canceled', 'anulado', 'anulada')`);
            if (reqDateGeneral && reqDateGeneral !== 'all') {
                conds.push(sql`DATE(${schema.appointments.date_time}) = ${reqDateGeneral}`);
            }

            const dashboardAppointments = await db.select({
                id: schema.appointments.id,
                lead_id: schema.appointments.lead_id,
                client_name: sql<string>`COALESCE(${schema.leads.client_name}, 'Cliente')`,
                phone: sql<string>`COALESCE(${schema.leads.phone}, '')`,
                service_type: sql<string>`COALESCE(${schema.appointments.service_type}, 'Servicio')`,
                category_name: sql<string>`COALESCE(${schema.categories.name}, 'General')`,
                category_id: schema.appointments.category_id,
                date_time: schema.appointments.date_time,
                status: sql<string>`COALESCE(${schema.appointments.status}, 'confirmed')`,
                created_at: schema.appointments.created_at,
                total_price: sql<number>`COALESCE(${schema.appointments.total_price}, 0)::float`,
            })
            .from(schema.appointments)
            .leftJoin(schema.leads, eq(schema.appointments.lead_id, schema.leads.id))
            .leftJoin(schema.categories, eq(schema.appointments.category_id, schema.categories.id))
            .where(and(...conds))
            .orderBy(desc(schema.appointments.date_time))
            .limit(50);

            const formattedAppts = dashboardAppointments.map((a) => ({
                ...a,
                date_time: a.date_time ? new Date(a.date_time).toISOString() : new Date().toISOString(),
                created_at: a.created_at ? new Date(a.created_at).toISOString() : new Date().toISOString(),
            }));

            return res.status(200).json({
                leads: dashboardLeads.map(l => ({
                    ...l,
                    created_at: l.created_at ? new Date(l.created_at).toISOString() : undefined,
                    updated_at: l.updated_at ? new Date(l.updated_at).toISOString() : null,
                })),
                appointments: formattedAppts,
                stats: {
                    totalAppointments: Number(ordersCount?.count || 0),
                    totalRevenue: Number(incomeData.total || 0),
                    totalClients: Number(leadsCount?.count || 0),
                    activeStaff: 5
                }
            });
        }

        // --- APPOINTMENTS ---
        if (sec === 'appointments') {
            if (req.method === 'GET') {
                const reqStatus = req.query.status as string;
                const reqDate = req.query.date as string;

                const conditions = [];
                if (reqStatus === 'completed') {
                    conditions.push(sql`LOWER(${schema.appointments.status}) IN ('completed', 'realizada', 'finalizada', 'servido', 'pagada', 'concluida')`);
                } else if (reqStatus === 'pending') {
                    conditions.push(sql`LOWER(${schema.appointments.status}) NOT IN ('cancelled', 'canceled', 'anulado', 'anulada', 'completed', 'realizada', 'finalizada', 'servido', 'pagada', 'concluida')`);
                } else {
                    // 'all' includes everything except explicitly canceled
                    conditions.push(sql`LOWER(${schema.appointments.status}) NOT IN ('cancelled', 'canceled', 'anulado', 'anulada')`);
                }
                
                if (reqDate === 'hoy') {
                    const todayStr = new Date().toLocaleDateString('sv-SE');
                    conditions.push(sql`DATE(${schema.appointments.date_time}) = ${todayStr}`);
                } else if (reqDate === 'tomorrow') {
                    const t = new Date();
                    t.setDate(t.getDate() + 1);
                    const tmrwStr = t.toLocaleDateString('sv-SE');
                    conditions.push(sql`DATE(${schema.appointments.date_time}) = ${tmrwStr}`);
                }
                const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

                const [totalCountObj] = await db.select({ count: sql`count(*)` })
                                        .from(schema.appointments)
                                        .where(whereClause);
                
                const results = await db.select({
                    id: schema.appointments.id,
                    lead_id: schema.appointments.lead_id,
                    client_name: sql<string>`COALESCE(${schema.leads.client_name}, 'Cliente')`,
                    phone: sql<string>`COALESCE(${schema.leads.phone}, '')`,
                    service_type: sql<string>`COALESCE(${schema.appointments.service_type}, 'Servicio')`,
                    category_name: sql<string>`COALESCE(${schema.categories.name}, 'General')`,
                    category_id: schema.appointments.category_id,
                    date_time: schema.appointments.date_time,
                    status: sql<string>`COALESCE(${schema.appointments.status}, 'pending')`,
                    created_at: schema.appointments.created_at,
                    total_price: sql<number>`COALESCE(${schema.appointments.total_price}, 0)::float`,
                    total_duration: schema.appointments.total_duration,
                    selected_services: schema.appointments.selected_services,
                    is_bot_enabled: sql<boolean>`COALESCE(${schema.leads.is_bot_enabled}, true)`
                })
                .from(schema.appointments)
                .leftJoin(schema.leads, eq(schema.appointments.lead_id, schema.leads.id))
                .leftJoin(schema.categories, eq(schema.appointments.category_id, schema.categories.id))
                .where(whereClause)
                .orderBy(desc(schema.appointments.date_time))
                .limit(limit)
                .offset(offset);

                const count = Number(totalCountObj?.count || 0);
                const formattedAppts = results.map((a) => ({
                    ...a,
                    date_time: a.date_time ? new Date(a.date_time).toISOString() : new Date().toISOString(),
                    created_at: a.created_at ? new Date(a.created_at).toISOString() : new Date().toISOString(),
                    total_price: Number(a.total_price || 0),
                    total_duration: Number(a.total_duration || 0),
                    selected_services: Array.isArray(a.selected_services) ? (a.selected_services as Array<{id?: string, title?: string, price?: string | number, duration?: string | number}>).map((s) => ({
                        ...s,
                        price: s.price ? Number(s.price) : 0,
                        duration: s.duration ? parseInt(String(s.duration).replace(/\D/g, ''), 10) || 0 : 0
                    })) : []
                }));

                return res.status(200).json({ 
                    appointments: formattedAppts,
                    metadata: {
                        total: count,
                        limit,
                        offset,
                        hasMore: offset + limit < count
                    }
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
                const detail = results.map((row: {
                    id: string,
                    username: string,
                    role: string | null,
                    email: string | null
                }) => ({
                    id: row.id,
                    username: row.username,
                    role: row.role,
                    email: row.email
                }));
                return res.status(200).json({ users: detail });
            }
        }

        // --- STAFF MANAGEMENT REDIRECT TO CATALOGS ---
        if (sec === 'staff') {
            return res.status(200).json({ redirect: '/api/admin?section=catalogs&type=staff' });
        }

        // --- INCOME / CASHFLOW ---
        if (sec === 'income') {
            if (req.method === 'GET') {
                const { startDate, endDate } = req.query;
                let dateFilter = sql`1=1`;
                if (startDate && endDate) {
                    dateFilter = and(
                        sql`${schema.appointments.date_time} >= ${startDate}`,
                        sql`${schema.appointments.date_time} <= ${endDate}`
                    );
                }

                const results = await db.select({
                    id: schema.appointments.id,
                    lead_id: schema.appointments.lead_id,
                    client_name: sql<string>`COALESCE(${schema.leads.client_name}, 'Cliente sin nombre')`,
                    phone: schema.leads.phone,
                    service_type: schema.appointments.service_type,
                    category_name: schema.categories.name,
                    date_time: schema.appointments.date_time,
                    status: schema.appointments.status,
                    total_price: schema.appointments.total_price,
                    selected_services: schema.appointments.selected_services,
                    is_bot_enabled: schema.leads.is_bot_enabled
                })
                .from(schema.appointments)
                .leftJoin(schema.leads, eq(schema.appointments.lead_id, schema.leads.id))
                .leftJoin(schema.categories, eq(schema.appointments.category_id, schema.categories.id))
                .where(and(
                    sql`LOWER(${schema.appointments.status}) IN ('realizada', 'concluida', 'pagada', 'confirmed', 'completada', 'completado', 'finalizada', 'servido')`,
                    dateFilter
                ))
                .orderBy(desc(schema.appointments.date_time));
                
                const validResults = results.filter(a => !isNaN(Number(a.total_price || 0)));
                const totalRevenueVal = validResults.reduce((acc, a) => acc + Number(a.total_price || 0), 0);
                const count = validResults.length;
                const evolutionMap: Record<string, number> = {};
                
                const payments = validResults.map(a => {
                    const amount = Number(a.total_price || 0);
                    if (a.date_time) {
                         const dateObj = new Date(a.date_time);
                         // Use YYYY-MM-DD or Month name for evolution. Frontend expects 'date' string.
                         const dateKey = dateObj.toISOString().split('T')[0]; // Use ISO date for stability
                         evolutionMap[dateKey] = (evolutionMap[dateKey] || 0) + amount;
                    }
                    
                    return {
                        id: a.id,
                        lead_id: a.lead_id,
                        client_name: a.client_name,
                        is_bot_enabled: a.is_bot_enabled,
                        parent_service: a.category_name || a.service_type,
                        selected_services: Array.isArray(a.selected_services) ? (a.selected_services as Array<{title?: string, price?: string | number}>).map((s) => ({
                            title: s.title || 'Servicio',
                            price: s.price ? Number(s.price) : 0,
                        })) : [],
                        date: a.date_time ? new Date(a.date_time).toISOString() : new Date().toISOString(),
                        amount: amount,
                        status: a.status || 'paid',
                        payment_method: 'Manual/Bot',
                        phone: a.phone || ''
                    };
                });
                
                const evolution = Object.keys(evolutionMap).sort().map(date => ({
                    date,
                    revenue: evolutionMap[date]
                }));

                if (evolution.length === 0) {
                    evolution.push({ date: new Date().toISOString().split('T')[0], revenue: 0 });
                }

                return res.status(200).json({
                    stats: {
                        revenue: totalRevenueVal,
                        ticket: count > 0 ? Math.round(totalRevenueVal / count) : 0,
                        count: count
                    },
                    payments,
                    evolution
                });
            }
        }

        // --- CATALOGS ADMIN (POST/PUT/DELETE) ---
        if (sec === 'catalogs') {
            const table = catType === 'categories' ? schema.categories : (catType === 'services' ? schema.services : schema.staff);
            const rawCategoryId = (req.query.categoryId || req.query.category_id) as string;
            
        // --- CATALOGS ADMIN (Write Operations) ---
        if (sec === 'catalogs') {
            const table = catType === 'categories' ? schema.categories : (catType === 'services' ? schema.services : schema.staff);
            
            // GET is handled at the top (publicly) to resolve session/rewrite issues
            if (req.method === 'GET') {
                return res.status(405).json({ error: 'GET handled by public catalog handler' });
            }

            if (req.method === 'POST') {
                const [item] = await db.insert(table as any).values(req.body).returning();
                return res.status(201).json({ [catType.slice(0,-1)]: item });
            }
            
            if (req.method === 'PUT' || req.method === 'PATCH') {
                const id = req.query.id as string;
                
                // Sanitize body: Remove relational/virtual fields that don't exist in the DB table
                const { services: _s, specialties: _sp, ...cleanBody } = req.body;
                
                const [item] = await db.update(table as any)
                    .set(cleanBody)
                    .where(eq((table as any).id, id))
                    .returning();
                return res.status(200).json({ [catType.slice(0,-1)]: item });
            }

            if (req.method === 'DELETE') {
                const id = req.query.id as string;
                await db.delete(table as any).where(eq((table as any).id, id));
                return res.status(200).json({ success: true });
            }
        }

        return res.status(405).json({ error: 'Method not allowed or Section missing' });
    } catch (e: any) {
        console.error(`[ADMIN ERROR] section=${sec} type=${req.query.type}`, e);
        return res.status(500).json({ 
            error: 'Internal Server Error', 
            details: e.message,
            stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
        });
    }

}
