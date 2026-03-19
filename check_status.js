
import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function check() {
    const res = await sql`SELECT status, count(*) FROM appointments GROUP BY status`;
    console.log(JSON.stringify(res, null, 2));
}

check();
