import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../api/_services/schema.js';

config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const sql = neon(connectionString!);
const db = drizzle(sql, { schema });

async function main() {
    const cats = await db.select().from(schema.categories);
    console.log("--- CATEGORIES & IMAGES ---");
    cats.forEach(c => {
        console.log(`Name: ${c.name}`);
        console.log(`  Active: ${c.active}`);
        console.log(`  price_list_url: ${c.price_list_url ? c.price_list_url.substring(0, 80) + '...' : 'NULL'}`);
        console.log(`  image_url: ${c.image_url ? c.image_url.substring(0, 80) + '...' : 'NULL'}`);
        console.log("------------------");
    });
}
main().catch(console.error);
