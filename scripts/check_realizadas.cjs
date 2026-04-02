
const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const url = process.env.DATABASE_URL;
const sql = neon(url);

async function run() {
  try {
    const res = await sql`
      SELECT 
        a.id, a.status, a.total_price, a.date_time, a.category_id, a.lead_id,
        l.client_name 
      FROM appointments a 
      LEFT JOIN leads l ON a.lead_id = l.id 
      WHERE lower(a.status) = 'realizada'
    `;
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('ERROR:', err);
  }
}
run();
