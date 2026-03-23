import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { sql } from '../api/_services/db.js';

async function fix() {
    console.log("Fixing leads table schema via db.js connection...");
    try {
        await sql`ALTER TABLE leads ALTER COLUMN is_bot_enabled SET DEFAULT true;`;
        console.log("Fixed is_bot_enabled default.");
        
        await sql`ALTER TABLE leads ALTER COLUMN chat_history SET DEFAULT '[]'::jsonb;`;
        console.log("Fixed chat_history default.");

        await sql`UPDATE leads SET is_bot_enabled = true WHERE is_bot_enabled IS NULL;`;
        console.log("Updated existing null values.");

        console.log("Schema fix completed.");
    } catch (e) {
        console.error("Fix failed:", e);
    }
    process.exit(0);
}
fix();
