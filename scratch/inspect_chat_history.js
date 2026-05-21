import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { leads } from '../api/_services/schema.js';
import { eq } from 'drizzle-orm';

async function inspect() {
    try {
        const lead = await db.select().from(leads).where(eq(leads.client_name, 'josefina breu')).limit(1);
        if (lead.length === 0) {
            console.log("Lead not found");
            process.exit(0);
        }
        
        console.log(`Lead ID: ${lead[0].id}`);
        console.log(`Name: ${lead[0].client_name}`);
        console.log(`Created: ${lead[0].created_at}`);
        console.log(`Current State: ${JSON.stringify(lead[0].current_state, null, 2)}`);
        console.log(`Chat History:`);
        const history = lead[0].chat_history;
        if (Array.isArray(history)) {
            history.forEach((h, idx) => {
                console.log(`  [${idx}] [${h.role || h.author}]: ${h.content || h.text || JSON.stringify(h)}`);
            });
        } else {
            console.log(JSON.stringify(history, null, 2));
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspect();
