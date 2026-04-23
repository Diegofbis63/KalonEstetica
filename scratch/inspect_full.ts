
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../api/_services/schema.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function check() {
    console.log('--- BUSINESS CONFIG ---');
    const config = await db.select().from(schema.business_config);
    console.log(JSON.stringify(config, null, 2));

    console.log('--- CATEGORIES ---');
    const cats = await db.select().from(schema.categories);
    console.log(JSON.stringify(cats, null, 2));

    console.log('--- SERVICES (Images only) ---');
    const svcs = await db.select({
        id: schema.services.id,
        title: schema.services.title,
        image_url: schema.services.image_url,
        active: schema.services.active
    }).from(schema.services).limit(10);
    console.log(JSON.stringify(svcs, null, 2));

    process.exit(0);
}

check().catch(console.error);
