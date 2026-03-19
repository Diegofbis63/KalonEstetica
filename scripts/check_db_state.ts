
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../api/_services/schema.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function check() {
    const users = await db.select().from(schema.admin_users);
    console.log('--- ADMIN USERS ---');
    console.log(JSON.stringify(users, null, 2));

    const perms = await db.select().from(schema.user_permissions);
    console.log('--- PERMISSIONS ---');
    console.log(JSON.stringify(perms, null, 2));

    const leads = await db.select().from(schema.leads).limit(5);
    console.log('--- LEADS SAMPLE ---');
    console.log(JSON.stringify(leads, null, 2));

    process.exit(0);
}

check().catch(console.error);
