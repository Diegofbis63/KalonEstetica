import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { leads } from '../api/_services/schema.js';
import { desc } from 'drizzle-orm';

async function readChat() {
    try {
        const leadList = await db.select().from(leads).orderBy(desc(leads.created_at));
        console.log(`Found ${leadList.length} leads in total.`);
        
        let josefina = leadList.find(l => l.client_name?.toLowerCase().includes('josefina'));
        if (!josefina) {
            josefina = leadList[0];
        }

        if (josefina) {
            console.log(`\n--- Chat history for Lead: ${josefina.client_name} (ID: ${josefina.id}) ---`);
            console.log(`State: ${JSON.stringify(josefina.current_state, null, 2)}`);
            console.log(`Chat History: ${JSON.stringify(josefina.chat_history, null, 2)}`);
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

readChat();
