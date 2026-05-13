import { sql } from 'drizzle-orm';
import { db } from './api/_services/db';

async function run() {
    const now = new Date();
    const startDate = new Date(now.getTime());
    startDate.setTime(Math.ceil(startDate.getTime() / (1000 * 60 * 30)) * (1000 * 60 * 30));
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);
    
    console.log('StartDate UTC:', startDate.toISOString());
    
    const query = sql`SELECT slot_time as "slot_time" FROM get_available_slots('f2f5dccc-d6d7-433b-8372-965abf38d561'::uuid, ${startDate.toISOString()}::timestamp, ${endDate.toISOString()}::timestamp, 30) ORDER BY slot_time ASC`;
    const res = await db.execute(query);
    const tomorrow10amART = res.rows.filter(r => r.slot_time.includes('2026-05-14 13:00:00'));
    console.log('Tomorrow 10am ART (13:00 UTC):', tomorrow10amART);
    process.exit(0);
}
run();
