import { sql } from 'drizzle-orm';
import { db } from './api/_services/db';

async function run() {
    const res = await db.execute(sql`SELECT pg_get_functiondef('get_available_slots(uuid, timestamp without time zone, timestamp without time zone, integer)'::regprocedure)`);
    console.log(res.rows[0].pg_get_functiondef);
    process.exit(0);
}
run();
