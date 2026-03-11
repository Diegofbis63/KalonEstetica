import pg from 'pg';
import { readFileSync } from 'fs';
import { parse } from 'dotenv';
import bcrypt from 'bcrypt';

const envConfig = parse(readFileSync('.env.local'));
for (const k in envConfig) {
    process.env[k] = envConfig[k];
}

const { Client } = pg;
const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    await client.connect();

    const email = 'gabriela_adm_x79';
    const password = 'gK#9vL$2xP@mQ1';
    const hash = await bcrypt.hash(password, 10);

    await client.query(
        'INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET password_hash = $2',
        [email, hash]
    );

    console.log('Admin user created successfully.');
    await client.end();
}

main().catch(console.error);
