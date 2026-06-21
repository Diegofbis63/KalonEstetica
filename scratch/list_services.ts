import 'dotenv/config';
import { db, sql } from '../api/_services/db.ts';

async function run() {
    // Check what columns actually exist in appointments
    const res = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'appointments'
        ORDER BY ordinal_position;
    `;
    console.log("ACTUAL COLUMNS IN appointments table:");
    res.forEach((r: any) => console.log(`  ${r.column_name}: ${r.data_type}`));

    // Check the staffId in Stella's state
    const stella = await sql`SELECT * FROM leads WHERE client_name = 'Stella Maris' LIMIT 1`;
    console.log("\nStella Maris current_state:", JSON.stringify((stella[0] as any)?.current_state, null, 2));

    // Check if there are any appointments at all
    const appts = await sql`SELECT id, lead_id, date_time, status, service_type FROM appointments ORDER BY created_at DESC LIMIT 5`;
    console.log("\nLAST 5 APPOINTMENTS:", appts.length);
    appts.forEach((a: any) => console.log(` - ${a.id} | lead: ${a.lead_id} | ${a.date_time} | ${a.status} | ${a.service_type}`));

    // Check staff table
    const staff = await sql`SELECT id, name, work_start, work_end FROM staff WHERE is_active = true`;
    console.log("\nACTIVE STAFF:");
    staff.forEach((s: any) => console.log(` - ${s.id} | ${s.name} | ${s.work_start} - ${s.work_end}`));

    process.exit(0);
}

run().catch(console.error);
