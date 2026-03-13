const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function check() {
    const sql = neon(process.env.DATABASE_URL);
    try {
        const cols = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'leads'
        `;
        console.log(JSON.stringify(cols, null, 2));
    } catch (e) {
        console.error(e);
    }
}
check();
