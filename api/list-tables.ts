
import { db } from './_services/db.js';
import { sql as drizzleSql } from 'drizzle-orm';

export default async function handler(req, res) {
    let tables = [];
    let error = null;
    try {
        const result = await db.execute(drizzleSql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
        tables = result.rows.map(r => r.table_name);
    } catch (e) {
        error = e.message;
    }

    res.status(200).json({
        tables,
        error
    });
}
