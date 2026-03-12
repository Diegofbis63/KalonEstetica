import { Pool } from '@neondatabase/serverless';

async function check() {
    const pool = new Pool({
        connectionString: "***REMOVED***",
    });
    
    try {
        const schema = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'appointments'");
        console.log('Appointments schema:', JSON.stringify(schema.rows, null, 2));

        const res = await pool.query('SELECT id, selected_services, total_duration FROM appointments LIMIT 5');
        console.log('Appointments sample:', JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
        process.exit();
    }
}

check();
