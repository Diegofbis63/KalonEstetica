
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

async function run() {
  const sql = neon(process.env.DATABASE_URL!);
  const leadsCount = await sql`SELECT count(*) FROM leads`;
  const clientsCount = await sql`SELECT count(*) FROM clients`;
  const sampleLead = await sql`SELECT * FROM leads LIMIT 1`;
  
  console.log("LEADS COUNT:", leadsCount[0].count);
  console.log("CLIENTS COUNT:", clientsCount[0].count);
  console.log("SAMPLE LEAD:", JSON.stringify(sampleLead[0], null, 2));
}

run().catch(console.error);
