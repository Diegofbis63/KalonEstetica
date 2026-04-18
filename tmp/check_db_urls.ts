import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../api/_services/schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function checkCategories() {
    console.log("Checking categories for price_list_url...");
    const cats = await db.select().from(schema.categories);
    cats.forEach(c => {
        console.log(`- Category: ${c.name} | Price List URL: ${c.price_list_url ? c.price_list_url.substring(0, 30) + '...' : 'EMPTY'}`);
    });
    process.exit(0);
}

checkCategories().catch(console.error);
