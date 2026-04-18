
import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  
  console.log('--- CREATING business_config TABLE ---');
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS business_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    console.log('✅ business_config table created/verified');
  } catch (e) {
    console.error('❌ Error creating table:', e);
  }
}

main();
