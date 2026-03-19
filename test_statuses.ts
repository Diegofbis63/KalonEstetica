import { db } from './api/_services/db.js';
import { sql } from 'drizzle-orm';

async function test() {
    const res = await db.execute(sql`SELECT count(*) as total, min(date_time), max(date_time) FROM appointments WHERE status = 'REALIZADA'`);
    console.log("REALIZADA SUMMARY:", res.rows);
}

test();
