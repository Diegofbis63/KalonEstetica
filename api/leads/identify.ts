
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findLeadByFlexiblePhone } from '../_services/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        const lead = await findLeadByFlexiblePhone(phone);

        if (lead) {
            return res.status(200).json({
                found: true,
                lead: {
                    id: lead.id,
                    client_name: lead.client_name,
                    contact_info: typeof lead.contact_info === 'string' ? JSON.parse(lead.contact_info) : lead.contact_info,
                    current_state: lead.current_state
                }
            });
        } else {
            return res.status(200).json({ found: false });
        }
    } catch (error) {
        console.error('[identify.ts] Error identifying lead:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
