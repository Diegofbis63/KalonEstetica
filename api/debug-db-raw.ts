
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    const url = process.env.DATABASE_URL || '';
    const sql = neon(url);
    
    let result = null;
    let error = null;
    try {
        const catResult = await sql`SELECT * FROM categories LIMIT 1`;
        const svcResult = await sql`SELECT * FROM services LIMIT 1`;
        result = { categories: catResult, services: svcResult };
    } catch (e) {
        error = {
            message: e.message,
            stack: e.stack,
            code: e.code,
            severity: e.severity,
            detail: e.detail,
            hint: e.hint
        };
    }

    res.status(200).json({
        result,
        error
    });
}
