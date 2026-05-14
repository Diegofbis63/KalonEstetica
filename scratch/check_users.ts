
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function diag() {
  try {
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'admin_users'
    `;
    console.log("--- COLUMNS IN 'admin_users' ---");
    console.log(columns);

    const count = await sql`SELECT count(*) FROM admin_users`;
    console.log("--- USER COUNT ---");
    console.log(count);
  } catch (e) {
    console.error(e);
  }
}

diag();
