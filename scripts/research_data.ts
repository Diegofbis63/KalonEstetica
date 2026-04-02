import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env.local or .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
    console.error("No connection string found in .env or .env.local");
} else {
    process.env.DATABASE_URL = connectionString; // Ensure drizzle uses it
}

import { db } from '../api/_services/db.js';
import * as schema from '../api/_services/schema.js';
import { sql, ilike } from 'drizzle-orm';

async function main() {
    console.log("--- DATABASE RESEARCH ---");
    try {
        if (!db) {
            console.error("Database connection not initialized. Check DATABASE_URL.");
            return;
        }

        // 1. Total counts
        const appCount = await db.select({ count: sql`count(*)` }).from(schema.appointments);
        const leadCount = await db.select({ count: sql`count(*)` }).from(schema.leads);
        console.log(`Total Leads: ${leadCount[0].count}`);
        console.log(`Total Appointments: ${appCount[0].count}`);

        // 2. Status distribution
        console.log("\n--- Appointment Statuses ---");
        const statuses = await db.select({ 
            status: schema.appointments.status, 
            count: sql`count(*)` 
        }).from(schema.appointments).groupBy(schema.appointments.status);
        console.table(statuses);

        // 3. Search for Diego Federico
        console.log("\n--- Searching for 'Diego Federico' ---");
        const diegoLeads = await db.select().from(schema.leads).where(ilike(schema.leads.client_name, '%Diego Federico%'));
        console.log(`Found ${diegoLeads.length} leads matching name.`);
        
        for (const lead of diegoLeads) {
            console.log(`Lead ID: ${lead.id}, Name: ${lead.client_name}`);
            const apps = await db.select().from(schema.appointments).where(sql`lead_id = ${lead.id}`);
            console.log(`  Appointments associated: ${apps.length}`);
            for (const app of apps) {
                console.log(`    - ID: ${app.id}, Status: ${app.status}, Date: ${app.date_time}, Price: ${app.total_price}`);
            }
        }

        // 4. Sample of recent appointments with status 'confirmed' or others
        console.log("\n--- Sample of recent records ---");
        const sampleApps = await db.select().from(schema.appointments).limit(5);
        console.log("Sample appointments:", JSON.stringify(sampleApps, null, 2));

    } catch (e) {
        console.error("CRITICAL ERROR during research:", e);
    } finally {
        process.exit(0);
    }
}

main();
