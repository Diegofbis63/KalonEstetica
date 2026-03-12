import handler from '../leads/chat.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function (req: VercelRequest, res: VercelResponse) {
    req.query.action = 'mark-sent';
    return handler(req, res);
}
