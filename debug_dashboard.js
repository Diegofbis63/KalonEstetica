
import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function inspectData() {
    console.log("--- VIEW: view_system_metrics ---");
    try {
        const metrics = await sql`SELECT * FROM view_system_metrics`;
        console.log(JSON.stringify(metrics, null, 2));
    } catch (e) { console.error("Error metrics:", e.message); }

    console.log("\n--- VIEW: view_staff_full ---");
    try {
        const staff = await sql`SELECT * FROM view_staff_full`;
        console.log(JSON.stringify(staff, null, 2));
    } catch (e) { console.error("Error staff:", e.message); }

    console.log("\n--- TABLE: users ---");
    try {
        const users = await sql`SELECT id, username, role FROM users`;
        console.log(JSON.stringify(users, null, 2));
    } catch (e) { console.error("Error users:", e.message); }

    console.log("\n--- TABLE: appointments ---");
    try {
        const appointments = await sql`SELECT id, date_time, status FROM appointments LIMIT 5`;
        console.log(JSON.stringify(appointments, null, 2));
    } catch (e) { console.error("Error appointments:", e.message); }
}

inspectData();
