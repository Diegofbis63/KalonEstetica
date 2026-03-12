import { getDb } from './api/utils/db';

async function check() {
    const db = getDb();
    try {
        const res = await db.query('SELECT * FROM appointments LIMIT 3');
        console.log('Appointments sample:', JSON.stringify(res.rows, null, 2));
        
        const schema = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'appointments'");
        console.log('Appointments schema:', JSON.stringify(schema.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

check();
