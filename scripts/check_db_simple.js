const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function check() {
    console.log("Checking leads schema...");
    try {
        const res = await sql`
            SELECT column_name, is_nullable, column_default, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'leads'
            ORDER BY ordinal_position;
        `;
        console.table(res);

        const leadCount = await sql`SELECT count(*) FROM leads`;
        console.log("Lead count:", leadCount[0].count);

        const adminCount = await sql`SELECT count(*) FROM admin_users`;
        console.log("Admin count:", adminCount[0].count);
    } catch (e) {
        console.error("Error:", e);
    }
}
check();
