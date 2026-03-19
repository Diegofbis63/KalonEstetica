
import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  console.log('Connected to DB');
  
  const res = await client.query(
    "UPDATE categories SET name = $1, slug = $2 WHERE name = $3 RETURNING *",
    ['Manicuria y Pedicuria', 'manicuria-y-pedicuria', 'Manicuria']
  );
  
  console.log('Update result:', res.rows);
  await client.end();
}

run().catch(console.error);
