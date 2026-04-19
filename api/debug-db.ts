import { db } from './_services/db.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: any, res: any) {
    try {
        const config = await db.execute(sql`SELECT * FROM business_config`);
        const tables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
        
        return res.status(200).json({
            config: config.rows,
            tables: tables.rows.map((t: any) => t.table_name)
        });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
}
