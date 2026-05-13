import { sql } from 'drizzle-orm';
import { db } from './api/_services/db';

async function run() {
    const res = await db.execute(sql`SELECT date_time, service_type, status FROM appointments WHERE date_time::date = '2026-05-13'::date`);
    console.log(res.rows);
    process.exit(0);
}
run();
