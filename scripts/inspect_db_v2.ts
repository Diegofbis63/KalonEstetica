
import { db } from '../api/_services/db.js';
import { sql } from 'drizzle-orm';

async function listTables() {
    try {
        const result = await db.execute(sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('Tables in database:');
        result.rows.forEach(r => console.log(` - ${r.table_name}`));

        // Pick one table to inspect columns, e.g., leads
        const cols = await db.execute(sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'leads'
        `);
        console.log('\nColumns in "leads":');
        cols.rows.forEach(c => console.log(` - ${c.column_name}: ${c.data_type}`));

    } catch (e) {
        console.error('Failed to list tables:', e);
    }
    process.exit(0);
}

listTables();
