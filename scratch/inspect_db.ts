import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  try {
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'leads'
    `;
    console.log('Leads columns:', JSON.stringify(columns, null, 2));
    
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log('Tables in DB:', JSON.stringify(tables, null, 2));
  } catch (err) {
    console.error(err);
  }
}

main();
