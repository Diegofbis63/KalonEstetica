import { db } from '../api/_services/db.ts';
import * as schema from '../api/_services/schema.ts';
import { sql } from 'drizzle-orm';

async function main() {
    const result = await db.execute(sql`SELECT count(*) FROM categories`);
    console.log('COUNT CATEGORIES:', result);
    const cats = await db.query.categories.findMany();
    console.log('CATS:', cats);
}

main().catch(console.error);
