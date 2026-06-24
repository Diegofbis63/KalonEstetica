import { sql } from '../api/_services/db.ts';

async function run() {
    const appts = await sql`SELECT * FROM appointments WHERE lead_id = '04e27047-a2ba-4add-916b-b2bb6ca05580'`;
    console.log("ROSA APPOINTMENTS IN DB:", appts.length);
    appts.forEach((a: any) => console.log(JSON.stringify(a, null, 2)));
    
    // Let's also check if there was an insert error logged in standard console/system_logs or if we can see the exact staff table records to check foreign key constraint
    const staff = await sql`SELECT * FROM staff`;
    console.log("\nSTAFF IN DB:");
    staff.forEach((s: any) => console.log(`- ${s.id} ${s.name}`));

    process.exit(0);
}

run().catch(console.error);
