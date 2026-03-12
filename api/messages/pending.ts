import handler from '../leads/chat.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function (req: VercelRequest, res: VercelResponse) {
    req.query.action = 'pending';
    return handler(req, res);
}
