import pg from 'pg';
import fs from 'fs';
import { parse } from 'dotenv';
const env = parse(fs.readFileSync('.env.local'));
const { Client } = pg;
const client = new Client({ connectionString: env.DATABASE_URL });
async function check() {
    await client.connect();
    const cols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'chat_logs'");
    console.log(JSON.stringify(cols.rows, null, 2));
    await client.end();
}
check();
