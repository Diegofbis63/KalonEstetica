import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkCategories() {
    const sql = neon(process.env.DATABASE_URL);
    const results = await sql`SELECT id, name, image_url, price_list_url, active FROM categories`;
    console.log('--- CATEGORÍAS EN DB ---');
    console.table(results);
}

checkCategories().catch(console.error);
