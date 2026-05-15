import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processChat } from './_chat/engine';

export const config = {
  maxDuration: 60,
};

/**
 * CHATBOT KÂLON (v3.0 - MODULAR & HIGH PERFORMANCE)
 * Refactorizado por el Dream Team de Antigravity.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS & Method Check
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        await processChat(req.body, res);
    } catch (e: any) {
        console.error('[api/chat] Critical Handler Error:', e.message);
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal Server Error" });
        } else {
            res.end();
        }
    }
}
