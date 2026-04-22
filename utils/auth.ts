import cookie from 'cookie';
import jwt from 'jsonwebtoken';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-nova-estetica-key';

export function requireAuth(req: VercelRequest, res: VercelResponse) {
    const cookies = cookie.parse(req.headers.cookie || '');
    const token = cookies.nova_token;

    if (!token) {
        console.log("[Auth] No nova_token found in cookies");
        res.status(401).json({ error: 'No autenticado' });
        return null;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded;
    } catch (e: any) {
        console.log(`[Auth] JWT Verification failed: ${e.message}`);
        res.status(401).json({ error: 'Token inválido' });
        return null;
    }
}
