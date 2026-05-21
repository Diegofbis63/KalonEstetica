import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { leads, chat_logs } from '../api/_services/schema.js';
import { desc } from 'drizzle-orm';

async function inspect() {
    try {
        const leadList = await db.select().from(leads).orderBy(desc(leads.created_at)).limit(5);
        for (const l of leadList) {
            console.log(`Lead ID: ${l.id}, Name: ${l.client_name}, Phone: ${l.phone}, Created: ${l.created_at}`);
            console.log(`  State: ${JSON.stringify(l.current_state)}`);
            // Check if there are any chat_logs for this lead
            const logs = await db.select().from(chat_logs).where(eq(chat_logs.lead_id, l.id));
            console.log(`  Chat Logs count: ${logs.length}`);
            for (const log of logs) {
                console.log(`    [${log.role}]: ${log.content?.substring(0, 100)}`);
            }
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

// Helper to make eq work
import { eq } from 'drizzle-orm';
inspect();
