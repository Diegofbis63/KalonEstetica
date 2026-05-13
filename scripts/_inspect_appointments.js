import { config } from 'dotenv';
config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function main() {
  const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
  console.log('=== ALL PUBLIC TABLES ===');
  tables.forEach(t => console.log(`  ${t.table_name}`));

  const statuses = await sql`SELECT DISTINCT status FROM appointments`;
  console.log('\n=== APPOINTMENT STATUSES ===', statuses.map(s => s.status).join(', '));

  const upcoming = await sql`SELECT count(*) as c FROM appointments WHERE date_time >= NOW() AND status NOT IN ('canceled','CANCELADA')`;
  console.log('Upcoming appointments:', upcoming[0]?.c);

  // Check business hours / schedule config
  const biz = await sql`SELECT key, substring(value::text, 1, 120) as val FROM business_config WHERE key ILIKE '%hour%' OR key ILIKE '%schedule%' OR key ILIKE '%horario%' OR key ILIKE '%turno%'`;
  console.log('\n=== SCHEDULE CONFIG ===', biz.length ? '' : 'NONE');
  biz.forEach(b => console.log(`  ${b.key}: ${b.val}`));
}
main().catch(e => console.error(e.message));
