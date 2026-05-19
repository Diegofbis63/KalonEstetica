const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function main() {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT id, name, slug, image_url, price_list_url FROM categories`;
    fs.writeFileSync('scratch/cats_details.json', JSON.stringify(rows, null, 2), 'utf-8');
    console.log("JSON saved successfully");
}

main().catch(console.error);
