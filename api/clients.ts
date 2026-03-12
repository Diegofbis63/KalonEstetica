import { getDb } from './utils/db.js';
import { requireAuth } from './utils/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        const db = getDb();

        if (req.method === 'PATCH') {
            const { id } = req.query;
            const { client_name, phone, email, note } = req.body;

            if (!id) {
                return res.status(400).json({ error: 'Missing client id' });
            }

            // 1. Update direct fields
            if (client_name) {
                await db.query('UPDATE leads SET client_name = $1 WHERE id = $2', [client_name, id]);
            }

            // 2. Update contact_info JSONB fields
            if (phone) {
                await db.query(`UPDATE leads SET contact_info = jsonb_set(COALESCE(contact_info, '{}'::jsonb), '{phone}', $1) WHERE id = $2`, [JSON.stringify(phone), id]);
            }
            if (email) {
                await db.query(`UPDATE leads SET contact_info = jsonb_set(COALESCE(contact_info, '{}'::jsonb), '{email}', $1) WHERE id = $2`, [JSON.stringify(email), id]);
            }
            if (note !== undefined) {
                await db.query(`UPDATE leads SET contact_info = jsonb_set(COALESCE(contact_info, '{}'::jsonb), '{note}', $1) WHERE id = $2`, [JSON.stringify(note), id]);
            }

            const result = await db.query('SELECT *, contact_info->>\'phone\' as phone, contact_info->>\'email\' as email, contact_info->>\'note\' as note FROM leads WHERE id = $1', [id]);
            
            return res.status(200).json({ 
                message: 'Client updated successfully', 
                client: result.rows[0] 
            });
        }

        if (req.method === 'GET') {
            // Original GET logic
            const query = `
                SELECT 
                    l.id,
                    l.client_name,
                    l.contact_info->>'phone' as phone,
                    l.contact_info->>'email' as email,
                    l.contact_info->>'note' as note,
                    COUNT(a.id) as total_appointments,
                    MAX(a.date_time) as last_appointment,
                    jsonb_agg(
                        jsonb_build_object(
                            'id', a.id,
                            'date_time', a.date_time,
                            'service_type', a.service_type,
                            'status', a.status
                        ) ORDER BY a.date_time DESC
                    ) filter (where a.id is not null) as appointment_history
                FROM leads l
                LEFT JOIN appointments a ON l.id = a.lead_id
                GROUP BY l.id, l.client_name
                ORDER BY last_appointment DESC NULLS LAST;
            `;

            const result = await db.query(query);
            return res.status(200).json({ clients: result.rows });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('Error in /api/clients', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
