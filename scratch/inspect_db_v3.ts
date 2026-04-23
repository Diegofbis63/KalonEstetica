
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../api/_services/schema.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function check() {
    try {
        const config = await db.select().from(schema.business_config);
        console.log('--- CONFIG ---');
        console.log(JSON.stringify(config));

        const cats = await db.select().from(schema.categories);
        console.log('--- CATEGORIES ---');
        console.log(JSON.stringify(cats));

        const svcs = await db.select().from(schema.services).where(schema.services.active).limit(20);
        console.log('--- SERVICES ---');
        console.log(JSON.stringify(svcs));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

check();
