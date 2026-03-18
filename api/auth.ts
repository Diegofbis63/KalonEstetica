
import { db } from './_services/db.js';
import * as schema from './_services/schema.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import { eq, or } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-nova-estetica-key';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'POST') {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

        try {
            const user = await db.query.admin_users.findFirst({
                where: or(eq(schema.admin_users.username, username), eq(schema.admin_users.email, username)),
                with: {
                    permissions: {
                        with: {
                            category: true
                        }
                    }
                }
            });

            if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) return res.status(401).json({ error: 'Credenciales inválidas' });

            const permissions = (user as any).permissions.map((p: any) => (p.category as any)?.name).filter(Boolean) as string[];

            const userData = { 
                id: user.id, 
                username: user.username, 
                email: user.email, 
                role: user.role,
                permissions 
            };

            const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '7d' });

            res.setHeader('Set-Cookie', cookie.serialize('nova_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: 60 * 60 * 24 * 7 // 1 week
            }));

            return res.status(200).json({ success: true, user: userData });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Error del servidor' });
        }
    }

    if (req.method === 'GET') {
        const cookies = cookie.parse(req.headers.cookie || '');
        const token = cookies.nova_token;
        if (!token) return res.status(401).json({ error: 'No autenticado' });

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            return res.status(200).json({ success: true, user: decoded });
        } catch (e) {
            return res.status(401).json({ error: 'Token inválido' });
        }
    }

    if (req.method === 'DELETE') {
        res.setHeader('Set-Cookie', cookie.serialize('nova_token', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 0
        }));
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
