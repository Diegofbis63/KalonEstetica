import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function inspect() {
    const tables = ['categories', 'services', 'leads', 'staff', 'appointments'];
    for (const table of tables) {
        console.log(`\n--- TABLE: ${table} ---`);
        const columns = await sql`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = ${table}
            ORDER BY ordinal_position;
        `;
        console.table(columns);
    }
}

inspect().catch(console.error);
