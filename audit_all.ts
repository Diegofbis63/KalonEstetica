
import { neon } from '@neondatabase/serverless';

const url = "***REMOVED***";
const sql = neon(url);

async function run() {
    try {
        console.log("--- REALIZADA DATES ---");
        const a = await sql`SELECT id, date_time, status FROM appointments WHERE status = 'REALIZADA'`;
        console.log(JSON.stringify(a, null, 2));
    } catch (e) {
        console.error(e);
    }
}

run();
