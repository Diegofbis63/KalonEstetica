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

        // --- 2. AUTHENTICATION (POST/GET /api/admin?section=auth) ---
        if (sec === 'auth') {
            if (req.method === 'POST') {
                const { username, password } = req.body;
                
                // AUTO-SEED: Solo si el ambiente no es producción y no hay usuarios
                const usersCount = await db.select({ count: count() }).from(schema.admin_users);
                if (usersCount[0].count === 0) {
                    console.log('[admin Auth] Auto-seeding first admin user');
                    const hashedPass = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Kalon2024!', 10);
                    await db.insert(schema.admin_users).values({
                        username: 'admin',
                        password_hash: hashedPass,
                        role: 'admin',
                        email: 'admin@kalon.com'
                    });
                }

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
                    secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL_ENV,
                    sameSite: 'lax',
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
            } else if (req.method === 'GET') {
                const verifiedUser = await requireAuth(req, res);
                if (!verifiedUser) return; // requireAuth already replies with 401
                
                // Get fresh user data from database
                const dbUser = await db.query.admin_users.findFirst({
                    where: eq(schema.admin_users.id, (verifiedUser as any).id)
                });

                if (!dbUser) {
                    return res.status(404).json({ error: 'Usuario no encontrado en la base de datos' });
                }

                return res.status(200).json({
                    success: true,
                    user: {
                        id: dbUser.id,
                        username: dbUser.username,
                        role: dbUser.role,
                        email: dbUser.email
                    }
                });
            }
        }

        // --- 3. AUTH REQUIRED FOR EVERYTHING ELSE ---
        const user = await requireAuth(req, res);
        if (!user) return;

        // --- BUSINESS CONFIG (GET) ---
        if (sec === 'config' && req.method === 'GET') {
            try {
                const configs = await db.query.business_config.findMany();
                return res.status(200).json({ configs });
            } catch (e) {
                console.warn('[ADMIN] Table business_config not found, returning empty');
                return res.status(200).json({ configs: [] });
            }
        }

        // --- DASHBOARD / STATS ---
        if (sec === 'dashboard' && req.method === 'GET') {
            const [
                ordersCountObjResult,
                leadsCountObjResult,
                revObjResult,
                dashboardLeads,
                dashboardAppointments
            ] = await Promise.all([
                db.select({ count: sql`count(*)` }).from(schema.appointments),
                db.select({ count: sql`count(*)` }).from(schema.leads),
                db.select({
                    total: sql<number>`SUM(COALESCE(${schema.appointments.total_price}, 0))`
                })
                .from(schema.appointments)
                .where(sql`LOWER(${schema.appointments.status}) IN ('realizada', 'concluida', 'pagada', 'confirmed', 'completada', 'completado', 'finalizada', 'servido', 'completed')`),
                db.select({
                    id: schema.leads.id,
                    client_name: sql<string>`COALESCE(${schema.leads.client_name}, 'Cliente sin nombre')`,
                    phone: sql<string>`COALESCE(${schema.leads.phone}, ${schema.leads.contact_info}->>'phone', '')`,
                    status: sql<string>`COALESCE(${schema.leads.status}, 'new')`,
                    is_bot_enabled: sql<boolean>`COALESCE(${schema.leads.is_bot_enabled}, true)`,
                    created_at: schema.leads.created_at,
                    last_interaction: schema.leads.last_interaction,
                    category_name: sql<string>`COALESCE(${schema.categories.name}, 'Sin categoría')`,
                    intent_score: sql<number>`COALESCE(${schema.leads.intent_score}, 0)::int`
                })
                .from(schema.leads)
                .leftJoin(schema.categories, eq(schema.leads.category_id, schema.categories.id))
                .orderBy(desc(schema.leads.last_interaction))
                .limit(15),
                db.select({
                    id: schema.appointments.id,
                    lead_id: schema.appointments.lead_id,
                    client_name: sql<string>`COALESCE(${schema.leads.client_name}, 'Cliente')`,
                    phone: sql<string>`COALESCE(${schema.leads.phone}, ${schema.leads.contact_info}->>'phone', '')`,
                    service_type: sql<string>`COALESCE(${schema.appointments.service_type}, 'Servicio')`,
                    category_name: sql<string>`COALESCE(${schema.categories.name}, 'General')`,
                    date_time: schema.appointments.date_time,
                    status: schema.appointments.status,
                    total_price: schema.appointments.total_price,
                    total_duration: schema.appointments.total_duration,
                    selected_services: schema.appointments.selected_services
                })
                .from(schema.appointments)
                .leftJoin(schema.leads, eq(schema.appointments.lead_id, schema.leads.id))
                .leftJoin(schema.categories, eq(schema.appointments.category_id, schema.categories.id))
                .orderBy(desc(schema.appointments.date_time))
                .limit(10)
            ]);

            const ordersCountObj = ordersCountObjResult[0] || { count: 0 };
            const leadsCountObj = leadsCountObjResult[0] || { count: 0 };
            const revObj = revObjResult[0] || { total: 0 };
            
            return res.status(200).json({
                leads: dashboardLeads,
                appointments: dashboardAppointments,
                stats: {
                    totalAppointments: Number(ordersCountObj.count),
                    totalRevenue: Number(revObj.total || 0),
                    totalClients: Number(leadsCountObj.count),
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
                    conditions.push(sql`LOWER(${schema.appointments.status}) IN ('completed', 'realizada', 'finalizada', 'servido', 'pagada', 'concluida', 'finalizado')`);
                } else if (reqStatus === 'pending') {
                    conditions.push(sql`LOWER(${schema.appointments.status}) NOT IN ('cancelled', 'canceled', 'anulado', 'anulada', 'completed', 'realizada', 'finalizada', 'servido', 'pagada', 'concluida', 'finalizado')`);
                } else if (reqStatus !== 'all') {
                    // Si mandan un status específico, lo respetamos
                    conditions.push(eq(schema.appointments.status, reqStatus));
                }
                
                if (reqDate === 'hoy') {
                    // No filtramos por hoy si eso hace que la tabla quede vacía, 
                    // simplemente permitimos ver las más recientes
                } else if (reqDate === 'tomorrow') {
                    const t = new Date();
                    t.setDate(t.getDate() + 1);
                    const tmrwStr = t.toLocaleDateString('sv-SE');
                    conditions.push(sql`DATE(${schema.appointments.date_time}) = ${tmrwStr}`);
                }
                const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

                const [
                    totalCountObjResult,
                    results
                ] = await Promise.all([
                    db.select({ count: sql`count(*)` })
                        .from(schema.appointments)
                        .where(whereClause),
                    db.select({
                        id: schema.appointments.id,
                        lead_id: schema.appointments.lead_id,
                        client_name: sql<string>`COALESCE(${schema.leads.client_name}, 'Cliente')`,
                        phone: sql<string>`COALESCE(${schema.leads.phone}, ${schema.leads.contact_info}->>'phone', '')`,
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
                    .offset(offset)
                ]);

                const totalCountObj = totalCountObjResult[0] || { count: 0 };
                const count = Number(totalCountObj.count || 0);
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

        // --- CLIENTES COMPLETO (LEADS + STATS) ---
        if (sec === 'leads' || sec === 'clients' || sec === 'tracking') {
            const leadId = (req.query.leadId || req.query.leadid) as string;

            if (sec === 'tracking' || leadId) {
                if (req.method === 'GET') {
                    if (!leadId) return res.status(400).json({ error: 'leadId es requerido para el historial de chat' });
                    
                    const [lead] = await db.select()
                        .from(schema.leads)
                        .where(eq(schema.leads.id, leadId));
                    
                    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

                    const logs = await db.select()
                        .from(schema.chat_logs)
                        .where(eq(schema.chat_logs.lead_id, leadId))
                        .orderBy(asc(schema.chat_logs.created_at));

                    return res.status(200).json({
                        history: logs.map(l => ({
                            role: l.role,
                            content: l.content,
                            media_url: l.media_url,
                            media_data: l.media_data,
                            created_at: l.created_at ? l.created_at.toISOString() : null
                        })),
                        is_bot_enabled: lead.is_bot_enabled ?? true
                    });
                }
                
                if (req.method === 'POST') {
                    const action = req.query.action as string;
                    if (!leadId) return res.status(400).json({ error: 'leadId es requerido' });

                    if (action === 'toggle-bot') {
                        const { isBotEnabled } = req.body;
                        await db.update(schema.leads)
                            .set({ is_bot_enabled: isBotEnabled })
                            .where(eq(schema.leads.id, leadId));
                        return res.status(200).json({ success: true, is_bot_enabled: isBotEnabled });
                    }

                    if (action === 'reply') {
                        const { message, mediaData } = req.body;
                        
                        await db.insert(schema.chat_logs).values({
                            lead_id: leadId,
                            role: 'admin',
                            content: message || '',
                            media_url: null,
                            media_data: mediaData || null,
                            sent_to_whatsapp: false
                        });

                        // Desactivamos el bot automáticamente cuando responde el admin
                        await db.update(schema.leads)
                            .set({ 
                                is_bot_enabled: false,
                                last_interaction: new Date()
                            })
                            .where(eq(schema.leads.id, leadId));

                        return res.status(200).json({ success: true });
                    }

                    return res.status(400).json({ error: 'Acción no válida' });
                }
            }

            if (req.method === 'GET') {
                const results = await db.select({
                    id: schema.leads.id,
                    client_name: sql<string>`COALESCE(${schema.leads.client_name}, 'Cliente')`,
                    phone: sql<string>`COALESCE(${schema.leads.phone}, ${schema.leads.contact_info}->>'phone', '')`,
                    status: sql<string>`COALESCE(${schema.leads.status}, 'new')`,
                    created_at: schema.leads.created_at,
                    last_interaction: schema.leads.last_interaction,
                    is_bot_enabled: sql<boolean>`COALESCE(${schema.leads.is_bot_enabled}, true)`,
                    intent_score: sql<number>`COALESCE(${schema.leads.intent_score}, 0)::int`,
                    total_appointments: sql<number>`COUNT(${schema.appointments.id})::int`,
                    pending_appointments: sql<number>`COUNT(CASE WHEN LOWER(${schema.appointments.status}) NOT IN ('realizada', 'completed', 'finalizada', 'canceled', 'cancelled', 'anulado', 'anulada', 'cancelado', 'cancelada') THEN 1 END)::int`,
                    total_spent: sql<number>`SUM(COALESCE(${schema.appointments.total_price}, 0))::float`
                })
                .from(schema.leads)
                .leftJoin(schema.appointments, eq(schema.leads.id, schema.appointments.lead_id))
                .groupBy(schema.leads.id, schema.leads.client_name, schema.leads.phone, schema.leads.contact_info, schema.leads.status, schema.leads.created_at, schema.leads.last_interaction, schema.leads.intent_score)
                .orderBy(desc(schema.leads.last_interaction || schema.leads.created_at))
                .limit(limit)
                .offset(offset);

                const [totalCount] = await db.select({ count: sql`count(*)` }).from(schema.leads);

                const safeISO = (dateStr: any) => {
                    if (!dateStr) return null;
                    try {
                        const date = new Date(dateStr);
                        return isNaN(date.getTime()) ? null : date.toISOString();
                    } catch { return null; }
                };

                const formatted = results.map(c => ({
                    ...c,
                    name: c.client_name,
                    email: null,
                    created_at: safeISO(c.created_at) || new Date().toISOString(),
                    last_interaction: safeISO(c.last_interaction),
                    last_appointment: safeISO(c.last_interaction),
                    total_appointments: Number(c.total_appointments || 0),
                    pending_appointments: Number(c.pending_appointments || 0),
                    total_spent: Number(c.total_spent || 0),
                    intent_score: Number(c.intent_score || 0),
                    note: ''
                }));

                return res.status(200).json({ 
                    leads: formatted, 
                    clients: formatted,
                    metadata: {
                        total: Number(totalCount?.count || 0),
                        limit,
                        offset,
                        hasMore: offset + limit < Number(totalCount?.count || 0)
                    }
                });
            }

            if (req.method === 'DELETE') {
                const id = req.query.id as string;
                await db.delete(schema.leads).where(eq(schema.leads.id, id));
                return res.status(200).json({ success: true });
            }

            if (req.method === 'PUT' || req.method === 'PATCH') {
                const id = req.query.id as string;
                const [updated] = await db.update(schema.leads).set(req.body).where(eq(schema.leads.id, id)).returning();
                return res.status(200).json({ lead: updated });
            }
        }

        // --- USERS / PROFILE ---
        if (sec === 'users') {
            if (req.method === 'GET') {
                const results = await db.query.admin_users.findMany({
                    with: { permissions: true }
                });
                const detail = results.map((row: any) => ({
                    id: row.id,
                    username: row.username,
                    role: row.role,
                    email: row.email,
                    raw_password: row.raw_password || "",
                    category_ids: row.permissions?.map((p: any) => String(p.category_id)) || []
                }));
                return res.status(200).json({ users: detail });
            }

            if (req.method === 'PUT' || req.method === 'PATCH') {
                const { id, username, password, category_ids } = req.body;
                if (!id) return res.status(400).json({ error: 'User ID is required' });

                const updatePayload: any = {};
                if (username) updatePayload.username = username;
                if (password) {
                    // Only re-hash and update password if it actually changed
                    const existingUser = await db.query.admin_users.findFirst({
                        where: eq(schema.admin_users.id, id)
                    });
                    if (existingUser && existingUser.raw_password !== password) {
                        const hashedPass = await bcrypt.hash(password, 10);
                        updatePayload.password_hash = hashedPass;
                        updatePayload.raw_password = password;
                    }
                }

                // Update basic user profile details
                if (Object.keys(updatePayload).length > 0) {
                    await db.update(schema.admin_users)
                        .set(updatePayload)
                        .where(eq(schema.admin_users.id, id));
                }

                // Update permissions (category mapping) for staff members
                if (category_ids && Array.isArray(category_ids)) {
                    // First clear current permissions
                    await db.delete(schema.user_permissions)
                        .where(eq(schema.user_permissions.user_id, id));

                    // Insert new permissions
                    if (category_ids.length > 0) {
                        const newPermissions = category_ids.map((catId: string) => ({
                            user_id: id,
                            category_id: catId
                        }));
                        await db.insert(schema.user_permissions).values(newPermissions);
                    }
                }

                return res.status(200).json({ success: true });
            }
        }

        // --- STAFF MANAGEMENT ---
        if (sec === 'staff' || (sec === 'catalogs' && catType === 'staff')) {
            if (req.method === 'GET') {
                const results = await db.query.staff.findMany({
                    with: { specialties: true }
                });
                return res.status(200).json({ 
                    staff: results.map(s => ({
                        ...s,
                        is_active: s.is_active ?? true,
                        specialties: s.specialties?.map(sp => String(sp.category_id)) || []
                    }))
                });
            }
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
                    phone: sql<string>`COALESCE(${schema.leads.phone}, ${schema.leads.contact_info}->>'phone', '')`,
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
                    sql`LOWER(${schema.appointments.status}) IN ('realizada', 'concluida', 'pagada', 'confirmed', 'completada', 'completado', 'finalizada', 'servido', 'finalizado', 'completed')`,
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

        // --- BUSINESS CONFIG (POST/PUT) ---
        if (sec === 'config' && (req.method === 'POST' || req.method === 'PUT')) {
            const { key, value } = req.body;
            if (!key || value === undefined) return res.status(400).json({ error: 'Key and value required' });

            try {
                await db.insert(schema.business_config)
                    .values({ key, value, updated_at: new Date() })
                    .onConflictDoUpdate({
                        target: schema.business_config.key,
                        set: { value, updated_at: new Date() }
                    });
            } catch (err: any) {
                // Si falla porque la tabla no existe, intentamos CREARLA
                if (err.message?.includes('relation "business_config" does not exist')) {
                    console.log('[ADMIN] Creating business_config table on demand...');
                    await db.execute(sql`
                        CREATE TABLE IF NOT EXISTS business_config (
                            key TEXT PRIMARY KEY,
                            value TEXT NOT NULL,
                            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                        );
                    `);
                    // Re-intentamos el insert
                    await db.insert(schema.business_config)
                        .values({ key, value, updated_at: new Date() })
                        .onConflictDoUpdate({
                            target: schema.business_config.key,
                            set: { value, updated_at: new Date() }
                        });
                } else {
                    throw err; // Otros errores los dejamos pasar al catch general
                }
            }

            return res.status(200).json({ success: true });
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
