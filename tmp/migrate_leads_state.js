
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function run() {
    try {
        console.log('Adding current_state column to leads table...');
        await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS current_state JSONB;`;
        console.log('Column added successfully.');
    } catch (error) {
        console.error('Error migrating database:', error);
        process.exit(1);
    }
}

run();
