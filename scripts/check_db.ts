import dotenv from 'dotenv';
dotenv.config();
import { db, sql } from '../api/_services/db.js';

async function main() {
    try {
        const result = await sql`SELECT * FROM business_config`;
        console.log("All business_config:", result);
    } catch(err) {
        console.error(err);
    }
}
main();
