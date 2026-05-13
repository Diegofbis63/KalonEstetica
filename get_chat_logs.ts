import { sql } from 'drizzle-orm';
import { db } from './api/_services/db';

async function run() {
    const res = await db.execute(sql`SELECT * FROM chat_logs ORDER BY created_at DESC LIMIT 20`);
    console.log(res.rows);
    process.exit(0);
}
run();
