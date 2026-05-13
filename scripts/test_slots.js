import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function run() {
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  const slots = await sql`
    SELECT slot_time, professional_id 
    FROM get_available_slots('e95a8301-d52c-490b-8316-b04923197fb3'::uuid, ${startDate.toISOString()}::timestamp, ${endDate.toISOString()}::timestamp, 30)
    ORDER BY slot_time ASC
  `;
  console.log('Total slots:', slots.length);
  const byDay = {};
  slots.forEach(s => {
      const d = s.slot_time.toISOString().split('T')[0];
      byDay[d] = (byDay[d] || 0) + 1;
  });
  console.log('Slots by day:', byDay);
  console.log('First 5 slots:', slots.slice(0, 5));
}
run().catch(console.error);
