import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { appointments } from '../api/_services/schema.js';
import { eq } from 'drizzle-orm';

async function inspect() {
    try {
        const appts = await db.select().from(appointments).where(eq(appointments.lead_id, '6bfa9732-d763-4eea-880f-85fefd6c6a6b'));
        console.log(`Appointments for josefina breu: ${appts.length}`);
        for (const appt of appts) {
            console.log(JSON.stringify(appt, null, 2));
        }
        
        // Also list all appointments to see if there is any other
        const allAppts = await db.select().from(appointments).limit(10);
        console.log(`Total appointments in DB (limit 10): ${allAppts.length}`);
        for (const a of allAppts) {
            console.log(`Appt: ID ${a.id}, Lead ID: ${a.lead_id}, Status: ${a.status}, DateTime: ${a.date_time}`);
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspect();
