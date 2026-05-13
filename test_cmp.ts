import { sql } from 'drizzle-orm';
import { db } from './api/_services/db';

async function run() {
    const res = await db.execute(sql`
        SELECT 
            ('2026-05-14 02:30:00+00'::timestamp with time zone::time AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') >= '09:00:00'::time as is_greater,
            ('2026-05-14 02:30:00+00'::timestamp with time zone::time AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires') <= '20:00:00'::time as is_less
    `);
    console.log(res.rows);
    process.exit(0);
}
run();
