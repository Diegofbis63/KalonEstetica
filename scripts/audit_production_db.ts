
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function audit() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error("DATABASE_URL is missing in .env");
        return;
    }

    console.log("Connecting to:", url.split('@')[1]); // Safe log
    const sql = neon(url);

    try {
        console.log("--- TABLES CHECK ---");
        const tables = await sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `;
        console.log("Tables found:", tables.map(t => t.table_name).join(', '));

        if (tables.some(t => t.table_name === 'leads')) {
            console.log("--- LEADS COUNT ---");
            const count = await sql`SELECT count(*) as total FROM leads`;
            console.log("Total leads:", count[0].total);
            
            console.log("--- RECENT LEADS ---");
            const recent = await sql`SELECT id, client_name, created_at FROM leads ORDER BY created_at DESC LIMIT 5`;
            console.table(recent);
        } else {
            console.error("!!! CRITICAL: 'leads' table MISSING !!!");
        }

        console.log("--- CONFIG CHECK ---");
        const config = await sql`SELECT * FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL'`;
        console.log("Catalog Config:", config);

    } catch (e: any) {
        console.error("Audit failed:", e.message);
    }
}

audit();
