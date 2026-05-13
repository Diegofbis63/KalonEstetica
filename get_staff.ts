import { sql } from 'drizzle-orm';
import { db } from './api/_services/db';

async function run() {
    const res = await db.execute(sql`SELECT work_start, work_end FROM staff`);
    console.log(res.rows);
    process.exit(0);
}
run();
