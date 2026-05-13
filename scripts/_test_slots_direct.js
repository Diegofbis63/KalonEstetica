import { config } from 'dotenv';
config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';

async function run() {
    const sql = neon(process.env.DATABASE_URL);
    const res = await sql`
        SELECT slot_time as "slot_time", professional_id as "staff_id"
        FROM get_available_slots('e95a8301-d52c-490b-8316-b04923197fb3'::uuid, now()::timestamp, (now() + interval '7 days')::timestamp, 30)
    `;
    console.log("Slots count:", res.length);
    if(res.length > 0) console.log(res.slice(0, 5));
}
run();
