import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
dotenv.config();

const nql = neon(process.env.DATABASE_URL!);
const db = drizzle(nql);

async function run() {
    console.log("Checking DB timezone and slots...");
    const res = await db.execute(sql`SELECT * FROM categories LIMIT 1`);
    if (res.rows.length === 0) {
        console.log("No categories found");
        return;
    }
    const catId = res.rows[0].id;
    console.log("Category:", catId);
    
    // Check available slots
    const now = new Date();
    const startDate = new Date(now.getTime());
    startDate.setTime(Math.ceil(startDate.getTime() / (1000 * 60 * 30)) * (1000 * 60 * 30));
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);
    
    console.log("StartDate:", startDate.toISOString());
    console.log("EndDate:", endDate.toISOString());
    
    const slots = await db.execute(sql`
        SELECT slot_time as "slot_time", professional_id as "staff_id"
        FROM get_available_slots(${catId}::uuid, ${startDate.toISOString()}::timestamp, ${endDate.toISOString()}::timestamp, 30)
        ORDER BY slot_time ASC
        LIMIT 10
    `);
    console.log("Slots:", slots.rows.length);
    console.log(slots.rows);
}
run();
