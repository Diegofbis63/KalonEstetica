import pg from 'pg';
import fs from 'fs';
import { parse } from 'dotenv';
const env = parse(fs.readFileSync('.env.local'));
const { Client } = pg;
const client = new Client({ connectionString: env.DATABASE_URL });
async function check() {
    await client.connect();
    const res = await client.query("SELECT content, media_url, role FROM chat_logs ORDER BY created_at DESC LIMIT 10");
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
}
check();
