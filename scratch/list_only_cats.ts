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
    console.log("--- ALL CATEGORIES ---");
    cats.forEach(c => {
        console.log(`ID: ${c.id} | Name: ${c.name} | Slug: ${c.slug} | Active: ${c.active}`);
    });
}
main().catch(console.error);
