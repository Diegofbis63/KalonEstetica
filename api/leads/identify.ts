import { getLeadByPhone } from '../_services/db.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
    maxDuration: 15,
};

/**
 * POST /api/leads/identify
 * Busca un lead existente por número de teléfono (flujo "Ya tengo cuenta").
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { phone } = req.body as { phone?: string };

        if (!phone || !phone.trim()) {
            return res.status(400).json({ error: 'Se requiere el número de teléfono.' });
        }

        console.log(`[api/leads/identify] Buscando lead por teléfono: ${phone}`);
        const lead = await getLeadByPhone(phone.trim());

        if (!lead) {
            return res.status(200).json({ found: false, lead: null });
        }

        console.log(`[api/leads/identify] Lead encontrado: ${lead.id} (${lead.client_name})`);
        return res.status(200).json({
            found: true,
            lead: {
                id: lead.id,
                client_name: lead.client_name,
                contact_info: lead.contact_info,
                current_state: lead.current_state,
            }
        });

    } catch (e: any) {
        console.error('[api/leads/identify] ERROR:', e.message);
        return res.status(500).json({ error: 'Error interno al buscar el lead.' });
    }
}
