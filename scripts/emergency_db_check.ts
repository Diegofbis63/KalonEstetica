
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './api/_services/schema';

async function check() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error("DATABASE_URL not found");
        return;
    }
    const sql = neon(databaseUrl);
    const db = drizzle(sql, { schema });

    console.log("Checking database tables...");
    
    try {
        const cats = await db.select().from(schema.categories);
        const servs = await db.select().from(schema.services);
        const appointments = await db.select().from(schema.appointments);
        const leads = await db.select().from(schema.leads);
        const users = await db.select().from(schema.admin_users);

        console.log(`Categories: ${cats.length}`);
        console.log(`Services: ${servs.length}`);
        console.log(`Appointments: ${appointments.length}`);
        console.log(`Leads (Clients): ${leads.length}`);
        console.log(`Admin Users: ${users.length}`);

        if (leads.length > 0) {
            console.log("Sample Lead:", leads[0].client_name);
        }
    } catch (e) {
        console.error("Error querying database:", e);
    }
}

check();
