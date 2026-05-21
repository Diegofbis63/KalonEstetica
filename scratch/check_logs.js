import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { chat_logs, system_logs } from '../api/_services/schema.js';
import { desc } from 'drizzle-orm';

async function checkLogs() {
    try {
        console.log("Checking last 10 rows in chat_logs...");
        const chatLogs = await db.select().from(chat_logs).orderBy(desc(chat_logs.created_at)).limit(10);
        console.log(`Found ${chatLogs.length} recent chat_logs rows:`);
        for (const log of chatLogs) {
            console.log(`- Lead ID: ${log.lead_id}, Role: ${log.role}, Content: ${log.content?.substring(0, 50)}...`);
        }

        console.log("\nChecking last 10 rows in system_logs...");
        const sysLogs = await db.select().from(system_logs).orderBy(desc(system_logs.created_at)).limit(10);
        console.log(`Found ${sysLogs.length} recent system_logs rows:`);
        for (const log of sysLogs) {
            console.log(`- Level: ${log.level}, Msg: ${log.message?.substring(0, 100)}`);
        }

        process.exit(0);
    } catch (e) {
        console.error("Error checking logs:", e);
        process.exit(1);
    }
}

checkLogs();
