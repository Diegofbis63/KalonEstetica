import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local' });

const db = new Pool({ connectionString: process.env.POSTGRES_URL });

async function check() {
    try {
        const lRes = await db.query('SELECT * FROM leads LIMIT 1');
        console.log('Leads:', lRes.rows[0]);
        const aRes = await db.query('SELECT a.*, l.client_name, l.phone FROM appointments a LEFT JOIN leads l ON a.lead_id = l.id LIMIT 1');
        console.log('Appts:', aRes.rows[0]);
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

check();
