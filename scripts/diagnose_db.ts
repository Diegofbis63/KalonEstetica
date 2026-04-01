import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

async function diagnose() {
  const sql = neon(process.env.DATABASE_URL!);
  
  console.log('--- DATABASE DIAGNOSTICS ---');
  
  try {
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    
    console.log('Tables found:', tables.map(t => t.table_name));

    for (const { table_name } of tables) {
      const [{ count }] = await sql`SELECT count(*) FROM ${sql(table_name)}`;
      console.log(`Table: ${table_name} | Rows: ${count}`);
    }
    
    // Check specific columns for critical tables
    const appointmentsColumns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'appointments'
    `;
    console.log('Appointments Columns:', appointmentsColumns.map(c => `${c.column_name} (${c.data_type})`));

    const leadsColumns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'leads'
    `;
    console.log('Leads Columns:', leadsColumns.map(c => `${c.column_name} (${c.data_type})`));

  } catch (err) {
    console.error('Diagnosis failed:', err);
  }
}

diagnose();
