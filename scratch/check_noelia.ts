import { sql } from '../api/_services/db.ts';

async function run() {
    const leads = await sql`SELECT id, client_name, current_state FROM leads WHERE client_name ILIKE '%Noelia%' ORDER BY created_at DESC LIMIT 1`;
    if (leads.length === 0) {
        console.log("Noelia not found");
        process.exit(0);
    }
    const lead = leads[0];
    console.log("NOELIA LEAD:", JSON.stringify(lead, null, 2));

    const logs = await sql`SELECT role, content, created_at FROM chat_logs WHERE lead_id = ${lead.id} ORDER BY created_at ASC`;
    console.log("\nNOELIA CHAT LOGS:");
    logs.forEach((l: any) => console.log(`[${l.created_at}] [${l.role}] ${l.content}`));

    process.exit(0);
}

run().catch(console.error);
