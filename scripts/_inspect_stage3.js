import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function main() {
  // Check actual columns
  const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'services' ORDER BY ordinal_position`;
  console.log('=== SERVICES TABLE COLUMNS ===');
  for (const c of cols) {
    console.log('  ', c.column_name, ':', c.data_type);
  }
  
  // Get actual services data with correct columns
  const svcs = await sql`SELECT * FROM services WHERE active = true LIMIT 5`;
  console.log('\n=== SAMPLE SERVICES (raw) ===');
  for (const s of svcs) {
    console.log(JSON.stringify(s));
  }
}
main().catch(e => console.error(e.message));
