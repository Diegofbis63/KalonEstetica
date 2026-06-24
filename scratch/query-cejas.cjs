const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error("No DATABASE_URL found!");
  process.exit(1);
}

const sql = neon(connectionString);

async function main() {
  const services = await sql`SELECT id, title, price, active FROM services WHERE active = true AND (title ILIKE '%cejas%' OR title ILIKE '%laminado%' OR title ILIKE '%pack%')`;
  console.log("MATCHED SERVICES:");
  console.log(JSON.stringify(services, null, 2));
}

main().catch(console.error);
