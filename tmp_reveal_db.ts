import { sql } from './api/_services/db.js';

async function check() {
    try {
        const leads = await sql`SELECT * FROM leads ORDER BY created_at DESC LIMIT 3`;
        console.log('--- ÚLTIMOS LEADS ---');
        console.log(JSON.stringify(leads, null, 2));
    } catch (err) {
        console.error(err);
    }
}
check().then(() => process.exit(0));
