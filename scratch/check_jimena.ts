import { sql } from '../api/_services/db.ts';

async function run() {
    const leads = await sql`SELECT id, client_name, current_state FROM leads WHERE client_name ILIKE '%Jimena%' ORDER BY created_at DESC LIMIT 1`;
    if (leads.length === 0) {
        console.log("Jimena not found");
        process.exit(0);
    }
    const lead = leads[0];
    console.log("JIMENA LEAD:", JSON.stringify(lead, null, 2));

    const appts = await sql`SELECT * FROM appointments WHERE lead_id = ${lead.id}`;
    console.log("\nJIMENA APPOINTMENTS:", JSON.stringify(appts, null, 2));

    process.exit(0);
}

run().catch(console.error);
