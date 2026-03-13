import pg from 'pg';
import fs from 'fs';
import { parse } from 'dotenv';
const env = parse(fs.readFileSync('.env.local'));
const { Client } = pg;
const client = new Client({ connectionString: env.DATABASE_URL });
async function checkStats() {
    await client.connect();
    const stats = await client.query(`
        SELECT status, count(*) 
        FROM appointments 
        GROUP BY status
    `);
    console.log('Appointment Statuses:', JSON.stringify(stats.rows, null, 2));
    await client.end();
}
checkStats();
