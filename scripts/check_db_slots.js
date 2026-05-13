import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function run() {
  const cats = await sql`SELECT id, name FROM categories WHERE active = true`;
  console.log("Categories:", cats);

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  console.log(`Checking slots from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  for (const c of cats) {
    try {
      const slots = await sql`
        SELECT slot_time, professional_id 
        FROM get_available_slots(${c.id}::uuid, ${startDate.toISOString()}::timestamp, ${endDate.toISOString()}::timestamp, 30)
      `;
      console.log(`Slots for ${c.name} (${slots.length}):`, slots.slice(0, 5));
    } catch (e) {
      console.error(`Error checking slots for ${c.name}:`, e.message);
    }
  }

  // Also check appointments
  const appts = await sql`SELECT * FROM appointments ORDER BY date_time DESC LIMIT 5`;
  console.log("Recent appointments:", appts);
}

run().catch(console.error);
