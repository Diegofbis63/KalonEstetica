import { sql } from '../api/_services/db.ts';

async function run() {
    const leads = await sql`SELECT id, client_name, phone, current_state FROM leads WHERE client_name ILIKE '%Dora%' ORDER BY created_at DESC LIMIT 1`;
    console.log("LEAD:", JSON.stringify(leads[0], null, 2));

    if (leads.length > 0) {
        const logs = await sql`SELECT role, content FROM chat_logs WHERE lead_id = ${leads[0].id} ORDER BY created_at ASC`;
        console.log("CHAT LOGS IN DB:", logs.length);
        logs.forEach((l: any) => console.log(`[${l.role}] ${l.content.slice(0, 100).replace(/\n/g, ' ')}`));

        const appts = await sql`SELECT * FROM appointments WHERE lead_id = ${leads[0].id}`;
        console.log("APPOINTMENTS:", appts.length);
        appts.forEach((a: any) => console.log(`- ${a.id} ${a.date_time} ${a.staff_id} ${a.service_type}`));
    }
    process.exit(0);
}

run().catch(console.error);
