
import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function check() {
    const res = await sql`SELECT date_time, status FROM appointments WHERE status = 'REALIZADA'`;
    console.log(JSON.stringify(res, null, 2));
}

check();
