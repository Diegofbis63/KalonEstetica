import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

async function run() {
    if (!connectionString) {
        console.error("No DATABASE_URL found");
        return;
    }
    const sql = neon(connectionString);
    
    try {
        console.log("Checking appointments table...");
        const res = await sql`SELECT status, count(*) FROM appointments GROUP BY status`;
        console.log("Status distribution:");
        console.table(res);

        console.log("\nSearching for Diego Federico...");
        const leads = await sql`SELECT id, client_name FROM leads WHERE client_name ILIKE '%Diego Federico%'`;
        console.log("Leads found:", leads);

        if (leads.length > 0) {
            for (const lead of leads) {
                const apps = await sql`SELECT id, status, date_time, total_price FROM appointments WHERE lead_id = ${lead.id}`;
                console.log(`Appointments for lead ${lead.id}:`, apps);
            }
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
