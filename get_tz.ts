import { sql } from 'drizzle-orm';
import { db } from './api/_services/db';

async function run() {
    const res = await db.execute(sql`SHOW timezone`);
    console.log(res.rows);
    process.exit(0);
}
run();
