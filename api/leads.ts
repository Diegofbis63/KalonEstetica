import { getDb } from './utils/db.js';
import { requireAuth } from './utils/auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        const db = getDb();

        if (req.method === 'DELETE') {
            const { id } = req.query;

            if (!id) {
                return res.status(400).json({ error: 'Missing lead ID' });
            }

            // We can't delete leads easily if they have appointments unless we CASCADE or delete appointments first.
            // Requirement didn't specify, but usually we soft delete or delete both.
            // Let's do a hard delete of appointments first for this lead, then the lead.
            await db.query('DELETE FROM appointments WHERE lead_id = $1', [id]);
            const result = await db.query(
                'DELETE FROM leads WHERE id = $1 RETURNING *',
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Lead not found' });
            }

            return res.status(200).json({ message: 'Lead and associated appointments deleted', lead: result.rows[0] });
        } else {
            return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (e) {
        console.error('Error in /api/leads', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
