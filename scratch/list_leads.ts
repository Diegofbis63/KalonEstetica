import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { leads } from '../api/_services/schema.js';
import { desc } from 'drizzle-orm';

async function listLeads() {
    try {
        const leadList = await db.select().from(leads).orderBy(desc(leads.created_at));
        console.log(`Found ${leadList.length} leads in total:`);
        for (const l of leadList) {
            console.log(`- Lead: ${l.client_name} (ID: ${l.id})`);
            console.log(`  State: ${JSON.stringify(l.current_state)}`);
            console.log(`  History Length: ${l.chat_history?.length || 0}`);
            if (l.chat_history && l.chat_history.length > 0) {
                console.log(`  Last Message:`, l.chat_history[l.chat_history.length - 1]);
            }
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

listLeads();
