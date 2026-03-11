import { getDb } from './utils/db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-nova-estetica-key';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'POST') {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña requeridos' });
        }

        try {
            const db = getDb();
            const result = await db.query('SELECT * FROM admin_users WHERE email = $1', [email]);
            const user = result.rows[0];

            if (!user) {
                return res.status(401).json({ error: 'Credenciales inválidas' });
            }

            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) {
                return res.status(401).json({ error: 'Credenciales inválidas' });
            }

            const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

            res.setHeader('Set-Cookie', cookie.serialize('nova_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                path: '/',
                maxAge: 60 * 60 * 24 * 7 // 1 week
            }));

            return res.status(200).json({ success: true, user: { id: user.id, email: user.email } });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Error del servidor' });
        }
    }

    if (req.method === 'GET') {
        const cookies = cookie.parse(req.headers.cookie || '');
        const token = cookies.nova_token;

        if (!token) {
            return res.status(401).json({ error: 'No autenticado' });
        }

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
            path: '/',
            maxAge: 0
        }));
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
