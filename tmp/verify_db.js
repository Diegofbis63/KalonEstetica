import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const dotEnv = fs.readFileSync('.env', 'utf8');
const match = dotEnv.match(/DATABASE_URL=(.*)/);
const url = match ? match[1].trim() : null;

if (!url) {
    console.error('DATABASE_URL not found in .env');
    process.exit(1);
}

const sql = neon(url);

async function run() {
    try {
        console.log('--- Database Verification ---');
        const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
        console.log('Tables:', rows.map(r => r.table_name).join(', '));
        
        for (const r of rows) {
            const table = r.table_name;
            const count = await sql([`SELECT count(*) FROM "${table}"`]);
            console.log(`${table}: ${count[0].count} rows`);
        }
    } catch (e) {
        console.error('Authentication Failed:', e.message);
    }
}

run();
