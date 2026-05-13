import { sql } from 'drizzle-orm';
import { db } from './api/_services/db';

async function run() {
    const res = await db.execute(sql`SELECT * FROM staff_work_hours`);
    console.table(res.rows);
    process.exit(0);
}
run();
