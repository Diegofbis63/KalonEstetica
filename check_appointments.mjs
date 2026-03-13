import pg from 'pg';
import fs from 'fs';
import { parse } from 'dotenv';
const env = parse(fs.readFileSync('.env.local'));
const { Client } = pg;
const client = new Client({ connectionString: env.DATABASE_URL });
async function checkAppointments() {
    await client.connect();
    const columns = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'appointments'
    `);
    console.log(JSON.stringify(columns.rows, null, 2));
    await client.end();
}
checkAppointments();
