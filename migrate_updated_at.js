import pg from 'pg';
import fs from 'fs';
import { parse } from 'dotenv';

const env = parse(fs.readFileSync('.env.local'));
const { Client } = pg;
const client = new Client({ connectionString: env.DATABASE_URL });

async function migrate() {
    try {
        await client.connect();
        console.log('--- Migrando updated_at Columns ---');

        // 1. Add updated_at to leads
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='updated_at') THEN
                    ALTER TABLE leads ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
                END IF;
            END $$;
        `);
        
        // 2. Add updated_at to appointments
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='updated_at') THEN
                    ALTER TABLE appointments ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
                END IF;
            END $$;
        `);

        // 3. Update existing records
        await client.query(`UPDATE leads SET updated_at = created_at WHERE updated_at IS NULL;`);
        await client.query(`UPDATE appointments SET updated_at = created_at WHERE updated_at IS NULL;`);

        // 4. Create trigger function for updated_at if it doesn't exist
        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        // 5. Attach triggers
        await client.query(`
            DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
            CREATE TRIGGER update_leads_updated_at
            BEFORE UPDATE ON leads
            FOR EACH ROW
            EXECUTE PROCEDURE update_updated_at_column();
        `);

        await client.query(`
            DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;
            CREATE TRIGGER update_appointments_updated_at
            BEFORE UPDATE ON appointments
            FOR EACH ROW
            EXECUTE PROCEDURE update_updated_at_column();
        `);

        console.log('✅ Migración finalizada.');
        await client.end();
    } catch (e) {
        console.error('❌ Error en la migración:', e);
        process.exit(1);
    }
}
migrate();
