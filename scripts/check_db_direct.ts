import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);

async function check() {
    console.log("Direct DB Schema Check (Leads table)...");
    try {
        const res = await sql`
            SELECT column_name, is_nullable, column_default, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'leads'
            ORDER BY ordinal_position;
        `;
        console.table(res);
    } catch (e) {
        console.error("Query failed:", e);
    }
    process.exit(0);
}
check();
