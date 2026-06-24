import { sql } from '../api/_services/db.ts';

async function run() {
    const leads = await sql`SELECT id, client_name, phone, status, current_state, updated_at, created_at FROM leads ORDER BY updated_at DESC LIMIT 5`;
    console.log("RECENT LEADS:");
    for (const lead of leads) {
        console.log(`- ID: ${lead.id}, Name: ${lead.client_name}, Phone: ${lead.phone}, Status: ${lead.status}, Updated: ${lead.updated_at}`);
        console.log(`  State:`, JSON.stringify(lead.current_state));
        const logs = await sql`SELECT role, content, media_url, media_data FROM chat_logs WHERE lead_id = ${lead.id} ORDER BY created_at DESC LIMIT 5`;
        console.log(`  Logs count: ${logs.length} (showing last 3):`);
        logs.slice(0, 3).forEach((l: any) => console.log(`    [${l.role}] ${l.content?.slice(0, 100)} (media: ${l.media_url || !!l.media_data})`));
    }
    process.exit(0);
}

run().catch(console.error);
