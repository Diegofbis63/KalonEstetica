import { getDb } from './utils/db.js';
import { requireAuth } from './utils/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const user = requireAuth(req, res);
    if (!user) return;

    try {
        const db = getDb();

        const checkPermission = async (id: string, user: any) => {
            if (user.role === 'admin') return true;
            // Get category name for this appointment
            const res = await db.query('SELECT c.name FROM appointments a LEFT JOIN categories c ON a.category_id = c.id WHERE a.id = $1', [id]);
            if (res.rows.length === 0) return false;
            const categoryName = res.rows[0].name;
            return user.permissions.includes(categoryName);
        };

        if (req.method === 'PATCH') {
            const { id } = req.query;
            if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing appointment ID' });

            if (!await checkPermission(id, user)) {
                return res.status(403).json({ error: 'No tienes permiso para gestionar este servicio' });
            }

            const { status, date_time, service_type, client_name, phone } = req.body;

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
            const { lead_id, date_time, service_type, category_id } = req.body;

            if (!lead_id || !date_time || !service_type) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const query = `
                INSERT INTO appointments (lead_id, date_time, service_type, status, category_id)
                VALUES ($1, $2, $3, 'confirmed', $4)
                RETURNING *
            `;
            const result = await db.query(query, [lead_id, date_time, service_type, category_id]);

            await db.query(`UPDATE leads SET status = 'qualified' WHERE id = $1`, [lead_id]);

            return res.status(201).json({ appointment: result.rows[0] });

        } else if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing appointment ID' });

            if (!await checkPermission(id, user)) {
                return res.status(403).json({ error: 'No tienes permiso para gestionar este servicio' });
            }

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
