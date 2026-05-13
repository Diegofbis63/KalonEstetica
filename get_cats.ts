import { sql } from 'drizzle-orm';
import { db } from './api/_services/db';

async function run() {
    const res = await db.execute(sql`SELECT id, name FROM categories ORDER BY id`);
    console.log(res.rows);
    process.exit(0);
}
run();
