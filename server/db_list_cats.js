
import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  const res = await client.query("SELECT id, name, slug FROM categories");
  console.log('Categories:', res.rows);
  await client.end();
}

run().catch(console.error);
