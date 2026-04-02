
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function countRows() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error("DATABASE_URL not found in .env");
        return;
    }
    const sql = neon(databaseUrl);
    
    const tables = ['categories', 'services', 'leads', 'appointments', 'admin_users'];
    
    console.log("Database Row Counts:");
    for (const table of tables) {
        try {
            const result = await sql(`SELECT COUNT(*) FROM ${table}`);
            console.log(`${table}: ${result[0].count}`);
        } catch (e) {
            console.error(`Error counting ${table}:`, e.message);
        }
    }
}

countRows();
