
const { neon } = require('@neondatabase/serverless');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is missing");
    process.exit(1);
  }

  const sql = neon(connectionString);

  console.log("--- Checking appointments table schema ---");
  const tableInfo = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'appointments' AND column_name = 'total_price'
  `;
  console.log("appointments.total_price type:", tableInfo);

  console.log("\n--- Checking row counts ---");
  const counts = await Promise.all([
    sql`SELECT COUNT(*) FROM appointments`,
    sql`SELECT COUNT(*) FROM leads`,
    sql`SELECT COUNT(*) FROM categories`,
    sql`SELECT COUNT(*) FROM services`,
    sql`SELECT COUNT(*) FROM clients`
  ]);

  console.log("Appointments:", counts[0][0].count);
  console.log("Leads:", counts[1][0].count);
  console.log("Categories:", counts[2][0].count);
  console.log("Services:", counts[3][0].count);
  console.log("Clients:", counts[4][0].count);

  console.log("\n--- Testing problematic dashboard SUM ---");
  try {
    const sumResult = await sql`
      SELECT SUM(CAST(nullif(total_price, '') AS DECIMAL)) as total 
      FROM appointments 
      WHERE lower(status) IN ('completed', 'finalizada', 'realizada')
    `;
    console.log("Sum result with CAST/NULLIF:", sumResult[0].total);
  } catch (e) {
    console.error("Sum with CAST/NULLIF FAILED:", e.message);
  }

  try {
    const sumResultSimple = await sql`
      SELECT SUM(total_price) as total 
      FROM appointments 
      WHERE lower(status) IN ('completed', 'finalizada', 'realizada')
    `;
    console.log("Sum result SIMPLE:", sumResultSimple[0].total);
  } catch (e) {
    console.error("Sum SIMPLE FAILED:", e.message);
  }
}

main().catch(console.error);
