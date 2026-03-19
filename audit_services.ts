
import { neon } from '@neondatabase/serverless';
const sql = neon("***REMOVED***");

async function audit() {
    try {
        const res = await sql`SELECT id, title, category_id FROM services`;
        console.log('RESULTS_START');
        console.log(JSON.stringify(res, null, 2));
        console.log('RESULTS_END');
    } catch (e) {
        console.error('ERROR:', e);
    }
    process.exit(0);
}
audit();
