import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const url = process.env.DATABASE_URL;

if (!url) {
    console.error('DATABASE_URL not found in environment');
    process.exit(1);
}

const sql = neon(url);

async function run() {
    try {
        console.log('--- DB Audit (Auto-Auth) ---');
        const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
        const tables = rows.map(r => r.table_name);
        
        for (const table of tables) {
            try {
                const countRes = await sql([`SELECT count(*) FROM "${table}"`]);
                process.stdout.write(`${table}: ${countRes[0].count} rows | `);
                
                // If it has data, check columns
                if (countRes[0].count > 0) {
                     const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${table}`;
                     process.stdout.write(`Cols: ${cols.map(c => c.column_name).join(',')}\n`);
                } else {
                     process.stdout.write(`(empty)\n`);
                }
            } catch (e) {
                console.log(`\nTable "${table}": Error (${e.message})`);
            }
        }
    } catch (e) {
        console.error('Audit Failed:', e.message);
    }
}

run();
