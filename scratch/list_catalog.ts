import { db } from '../api/_services/db.ts';
import * as schema from '../api/_services/schema.ts';

async function main() {
    const cats = await db.query.categories.findMany();
    const svcs = await db.query.services.findMany();
    console.log('CATEGORIES:', JSON.stringify(cats, null, 2));
    console.log('SERVICES:', JSON.stringify(svcs, null, 2));
}

main().catch(console.error);
