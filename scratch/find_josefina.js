import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { leads, chat_logs } from '../api/_services/schema.js';
import { eq, ilike } from 'drizzle-orm';

async function findJosefina() {
    try {
        console.log("Searching for Josefina Breu in leads database...");
        const results = await db.select().from(leads).where(ilike(leads.client_name, '%josefina%'));
        
        if (results.length === 0) {
            console.log("No lead found matching 'josefina'. Let's search all recent leads:");
            const allRecent = await db.select().from(leads).orderBy(leads.last_interaction).limit(10);
            for (const lead of allRecent) {
                console.log(`- ID: ${lead.id}, Name: ${lead.client_name}, Last Active: ${lead.last_interaction}`);
            }
            process.exit(0);
        }

        console.log(`Found ${results.length} matching leads!`);
        for (const lead of results) {
            console.log("\n==================================================");
            console.log(`LEAD ID: ${lead.id}`);
            console.log(`CLIENT NAME: ${lead.client_name}`);
            console.log(`PHONE: ${lead.phone}`);
            console.log(`STATUS: ${lead.status}`);
            console.log(`CURRENT STATE:`, JSON.stringify(lead.current_state, null, 2));
            console.log("==================================================");

            // Fetch chat history from chat_logs
            const logs = await db.select().from(chat_logs)
                .where(eq(chat_logs.lead_id, lead.id))
                .orderBy(chat_logs.created_at);

            console.log(`\nCHAT HISTORY LOGS (${logs.length} messages in chat_logs):`);
            for (const log of logs) {
                const dateStr = log.created_at ? new Date(log.created_at).toISOString() : 'N/A';
                console.log(`[${dateStr}] [${log.role.toUpperCase()}] ${log.content || ''}`);
                if (log.media_url) {
                    console.log(`  └─> MEDIA URL: ${log.media_url}`);
                }
            }

            console.log(`\nCHAT HISTORY FIELD IN LEADS (${lead.chat_history?.length || 0} messages):`);
            if (lead.chat_history) {
                for (const msg of lead.chat_history) {
                    console.log(`[${msg.role?.toUpperCase()}] ${msg.content || ''}`);
                }
            }
        }
        process.exit(0);
    } catch (e) {
        console.error("Error fetching josefina:", e);
        process.exit(1);
    }
}

findJosefina();
