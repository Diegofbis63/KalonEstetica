
const pg = require('pg');
const fs = require('fs');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync('.env.local'));
const client = new pg.Client({ connectionString: env.DATABASE_URL });

async function check() {
  await client.connect();
  const res = await client.query("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public'");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
check();
