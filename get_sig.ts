import { sql } from 'drizzle-orm';
import { db } from './api/_services/db';

async function run() {
    const res = await db.execute(sql`SELECT proname, pg_get_function_arguments(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND proname = 'get_available_slots'`);
    console.log(res.rows);
    process.exit(0);
}
run();
