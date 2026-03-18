
import 'dotenv/config';
import { db } from './api/_services/db.js';
import * as schema from './api/_services/schema.js';
import { sql } from 'drizzle-orm';

async function audit() {
    try {
        const catCount = await db.select({ count: sql`count(*)` }).from(schema.categories);
        const svcCount = await db.select({ count: sql`count(*)` }).from(schema.services);
        
        console.log('--- DB AUDIT ---');
        console.log('Categories:', catCount[0].count);
        console.log('Services:', svcCount[0].count);
        
        if (Number(catCount[0].count) > 0) {
            const firstCat = await db.query.categories.findFirst();
            console.log('First Category Sample:', JSON.stringify(firstCat));
        }
    } catch (e) {
        console.error('AUDIT ERROR:', e);
    }
    process.exit(0);
}

audit();
