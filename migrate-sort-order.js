import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function migrate() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('Checking for sort_order column...');
        const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'services' AND column_name = 'sort_order'
    `);

        if (res.rows.length === 0) {
            console.log('Adding sort_order column...');
            await pool.query('ALTER TABLE services ADD COLUMN sort_order INTEGER DEFAULT 0');
            console.log('Column added successfully.');
        } else {
            console.log('Column sort_order already exists.');
        }

        console.log('Initializing sort_order for existing records...');
        const services = await pool.query('SELECT id FROM services ORDER BY created_at ASC');
        for (let i = 0; i < services.rows.length; i++) {
            await pool.query('UPDATE services SET sort_order = $1 WHERE id = $2', [i + 1, services.rows[i].id]);
        }
        console.log('Migration completed.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrate();
