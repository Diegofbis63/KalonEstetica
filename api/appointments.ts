import { getDb } from './utils/db.js';
import { requireAuth } from './utils/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const user = requireAuth(req, res);
    if (!user) return;

    try {
        const db = getDb();

        if (req.method === 'PATCH') {
            const { id } = req.query;
            const { status, date_time, service_type, client_name, phone } = req.body;

            if (!id) {
                return res.status(400).json({ error: 'Missing appointment ID' });
            }

            const updates: string[] = [];
            const values: any[] = [];
            let index = 1;

            if (status !== undefined) {
                updates.push(`status = $${index++}`);
                values.push(status);
            }
            if (date_time !== undefined) {
                updates.push(`date_time = $${index++}`);
                values.push(date_time);
            }
            if (service_type !== undefined) {
                updates.push(`service_type = $${index++}`);
                values.push(service_type);
            }

            let appointmentResult = null;
            if (updates.length > 0) {
                values.push(id);
                const query = `
                    UPDATE appointments 
                    SET ${updates.join(', ')} 
                    WHERE id = $${index} 
                    RETURNING *
                `;

                appointmentResult = await db.query(query, values);
            } else {
                appointmentResult = await db.query("SELECT * FROM appointments WHERE id = $1", [id]);
            }

            if (!appointmentResult || appointmentResult.rows.length === 0) {
                return res.status(404).json({ error: 'Appointment not found' });
            }

            const appointment = appointmentResult.rows[0];

            if (client_name !== undefined || phone !== undefined) {
                const leadUpdates: string[] = [];
                const leadValues: any[] = [];
                let leadIndex = 1;

                if (client_name !== undefined) {
                    leadUpdates.push(`client_name = $${leadIndex++}`);
                    leadValues.push(client_name);
                }

                if (phone !== undefined) {
                    leadUpdates.push(`contact_info = jsonb_set(COALESCE(contact_info::jsonb, '{}'::jsonb), '{phone}', $${leadIndex++}::jsonb)`);
                    leadValues.push(`"${phone}"`);
                }

                if (leadUpdates.length > 0) {
                    leadValues.push(appointment.lead_id);
                    const leadQuery = `
                        UPDATE leads
                        SET ${leadUpdates.join(', ')}
                        WHERE id = $${leadIndex}
                    `;
                    await db.query(leadQuery, leadValues);
                }
            }

            return res.status(200).json({ appointment });

        } else if (req.method === 'POST') {
            const { lead_id, date_time, service_type } = req.body;

            if (!lead_id || !date_time || !service_type) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const query = `
                INSERT INTO appointments (lead_id, date_time, service_type, status)
                VALUES ($1, $2, $3, 'confirmed')
                RETURNING *
            `;
            const result = await db.query(query, [lead_id, date_time, service_type]);

            await db.query(`UPDATE leads SET status = 'qualified' WHERE id = $1`, [lead_id]);

            return res.status(201).json({ appointment: result.rows[0] });

        } else if (req.method === 'DELETE') {
            const { id } = req.query;

            if (!id) {
                return res.status(400).json({ error: 'Missing appointment ID' });
            }

            // Using soft delete by changing status, or real delete if instructed.
            // Requirement said "borrado lógico (soft-delete)"
            const result = await db.query(
                `UPDATE appointments SET status = 'canceled' WHERE id = $1 RETURNING *`,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Appointment not found' });
            }

            return res.status(200).json({ message: 'Appointment soft deleted', appointment: result.rows[0] });
        } else {
            return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (e) {
        console.error('Error in /api/appointments', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
