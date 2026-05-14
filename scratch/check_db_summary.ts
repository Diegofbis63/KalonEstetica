import { db } from '../api/_services/db.ts';
import { sql } from 'drizzle-orm';

async function main() {
    const catsCount = await db.execute(sql`SELECT count(*) FROM categories`);
    console.log('COUNT CATEGORIES:', JSON.stringify(catsCount, null, 2));
    const svcsCount = await db.execute(sql`SELECT count(*) FROM services`);
    console.log('COUNT SERVICES:', JSON.stringify(svcsCount, null, 2));
    const cats = await db.execute(sql`SELECT id, name, price_list_url FROM categories`);
    console.log('CATS:', JSON.stringify(cats, null, 2));
}

main().catch(console.error);
