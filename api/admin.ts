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
            const [orders] = await db.select({ count: sql`count(*)` }).from(schema.appointments);
            const [leadsCount] = await db.select({ count: sql`count(*)` }).from(schema.leads);
            
            // Revenue should probably come from appointments total_price for now if income is empty
            const incomeRes = await db.select({ total: sql`sum(total_price)` }).from(schema.appointments);

            return res.status(200).json({
                stats: {
                    totalAppointments: Number(orders.count),
                    totalRevenue: Number(incomeRes[0]?.total || 0),
                    totalClients: Number(leadsCount.count),
                    activeStaff: 5
                }
            });
        }

        // --- APPOINTMENTS ---
        if (sec === 'appointments') {
            if (req.method === 'GET') {
                const results = await db.query.appointments.findMany({
                    with: { client: true, service: true, staff: true },
                    orderBy: [desc(schema.appointments.date_time)]
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
