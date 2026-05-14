import { db } from '../api/_services/db.ts';
import * as schema from '../api/_services/schema.ts';

async function main() {
    const cats = await db.query.categories.findMany();
    cats.forEach(c => console.log(`CAT: ${c.id} | ${c.name}`));
}

main().catch(console.error);
