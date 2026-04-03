import { db } from '../api/_services/db.ts';
import { sql } from 'drizzle-orm';

async function inspectDb() {
  const tables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
  console.log('Tables:', JSON.stringify(tables.rows, null, 2));

  const columns = await db.execute(sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name`);
  console.log('Columns:', JSON.stringify(columns.rows, null, 2));
  
  process.exit(0);
}

inspectDb().catch(err => {
  console.error(err);
  process.exit(1);
});
