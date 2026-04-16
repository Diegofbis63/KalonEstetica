import { config } from 'dotenv';
config({ path: '.env.local' });

async function scan() {
    console.log("--- STARTING DATABASE SCAN ---");
    // Dynamic import to ensure env vars are loaded before db initialization
    const { db } = await import('../api/_services/db.js');
    const schema = await import('../api/_services/schema.js');
    const { sql } = await import('drizzle-orm');
    
    console.log("Schema keys:", Object.keys(schema).filter(k => !k.includes('Relations')));
    
    const tables = [
        { name: 'admin_users', table: schema.admin_users },
        { name: 'clients', table: schema.clients },
        { name: 'income', table: schema.income },
        { name: 'categories', table: schema.categories },
        { name: 'services', table: schema.services },
        { name: 'leads', table: schema.leads },
        { name: 'staff', table: schema.staff },
        { name: 'appointments', table: schema.appointments },
        { name: 'chat_logs', table: schema.chat_logs },
        { name: 'system_logs', table: schema.system_logs }
    ];

    for (const { name, table } of tables) {
        if (!table) {
            console.warn(`Warning: Table ${name} is UNDEFINED in schema.`);
            continue;
        }
        try {
            const countResult = await db.select({ count: sql`count(*)` }).from(table);
            const count = countResult[0]?.count || 0;
            console.log(`Table [${name.padEnd(15)}]: ${count} rows`);
        } catch (e) {
            console.error(`Error scanning table ${name}:`, (e as Error).message);
        }
    }

    console.log("--- SCAN COMPLETE ---");
}

scan().catch(console.error);
