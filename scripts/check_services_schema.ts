import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { sql } from '../api/_services/db.js';

async function check() {
    console.log("Checking services table schema...");
    try {
        const res = await sql`
            SELECT column_name, is_nullable, column_default, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'services'
            ORDER BY ordinal_position;
        `;
        console.table(res);
    } catch (e) {
        console.error("Check failed:", e);
    }
    process.exit(0);
}
check();
