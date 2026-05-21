import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { appointments } from '../api/_services/schema.js';
import { desc } from 'drizzle-orm';

async function checkAppts() {
    try {
        console.log("Checking last 5 appointments...");
        const results = await db.select({
            id: appointments.id,
            lead_id: appointments.lead_id,
            date_time: appointments.date_time,
            status: appointments.status,
            total_price: appointments.total_price,
            created_at: appointments.created_at
        }).from(appointments).orderBy(desc(appointments.created_at)).limit(5);
        for (const appt of results) {
            console.log(`\nAppt ID: ${appt.id}`);
            console.log(`Lead ID: ${appt.lead_id}`);
            console.log(`Date/Time: ${appt.date_time}`);
            console.log(`Status: ${appt.status}`);
            console.log(`Total Price: ${appt.total_price}`);
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkAppts();
