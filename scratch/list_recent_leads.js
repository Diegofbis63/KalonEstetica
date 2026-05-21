import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { leads, chat_logs } from '../api/_services/schema.js';
import { desc } from 'drizzle-orm';

async function listRecentLeads() {
    try {
        console.log("Listing the 10 most recent leads in the database...");
        const allRecent = await db.select().from(leads).orderBy(desc(leads.last_interaction)).limit(10);
        for (const lead of allRecent) {
            console.log(`\n- ID: ${lead.id}`);
            console.log(`  Name: ${lead.client_name}`);
            console.log(`  Phone: ${lead.phone}`);
            console.log(`  Last Active: ${lead.last_interaction}`);
            console.log(`  Current State:`, JSON.stringify(lead.current_state, null, 2));
            console.log(`  Chat History length: ${lead.chat_history?.length || 0}`);
        }
        process.exit(0);
    } catch (e) {
        console.error("Error listing recent leads:", e);
        process.exit(1);
    }
}

listRecentLeads();
