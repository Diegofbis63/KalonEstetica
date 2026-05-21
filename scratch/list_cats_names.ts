import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../api/_services/schema.js';

config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
}

const sql = neon(connectionString);
const db = drizzle(sql, { schema });

async function main() {
    console.log("Fetching categories from database...");
    const cats = await db.select().from(schema.categories);
    console.log("--- CATEGORIES ---");
    cats.forEach(c => {
        console.log(`ID: ${c.id}`);
        console.log(`Name: ${c.name}`);
        console.log(`Slug: ${c.slug}`);
        console.log(`Active: ${c.active}`);
        console.log(`Image URL length: ${c.image_url?.length || 0}`);
        console.log(`Price List URL length: ${c.price_list_url?.length || 0}`);
        console.log("------------------");
    });

    console.log("\nFetching services...");
    const services = await db.select().from(schema.services);
    console.log("--- SERVICES (Active) ---");
    services.filter(s => s.active).forEach(s => {
        console.log(`ID: ${s.id} | Name: ${s.name} | CategoryId: ${s.category_id} | Price: ${s.price}`);
    });
}

main().catch(console.error);
