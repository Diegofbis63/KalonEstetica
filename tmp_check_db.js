import pg from 'pg';
import fs from 'fs';
import { parse } from 'dotenv';

const env = parse(fs.readFileSync('.env.local'));
const { Client } = pg;
const client = new Client({ connectionString: env.DATABASE_URL });

async function check() {
    try {
        await client.connect();
        const resLeads = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'leads'");
        console.log('LEADS COLUMNS:', resLeads.rows.map(r => r.column_name));
        
        const resAppts = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments'");
        console.log('APPOINTMENTS COLUMNS:', resAppts.rows.map(r => r.column_name));
        
        await client.end();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
