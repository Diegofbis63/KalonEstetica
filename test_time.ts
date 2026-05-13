import { sql } from 'drizzle-orm';
import { db } from './api/_services/db';

async function run() {
    const res = await db.execute(sql`
        SELECT 
            '23:30:00-03'::time with time zone AT TIME ZONE 'UTC' as a,
            '09:00:00'::time with time zone as b
    `);
    console.log(res.rows);
    process.exit(0);
}
run();
