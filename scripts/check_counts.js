
import { sql } from '../api/_services/db.ts';

async function check() {
    try {
        const todayStr = '2026-03-19';
        const [today] = await sql`SELECT count(*) FROM appointments WHERE date_time::date = ${todayStr}`;
        const [total] = await sql`SELECT count(*) FROM appointments`;
        const [leads] = await sql`SELECT count(*) FROM leads`;
        console.log('--- REPORTE DB ---');
        console.log('Today (2026-03-19):', today);
        console.log('Total Appointments:', total);
        console.log('Total Leads:', leads);
        
        const appts = await sql`SELECT id, date_time, status FROM appointments ORDER BY date_time DESC LIMIT 10`;
        console.log('Sample Appts:', appts);
    } catch (e) {
        console.error('ERROR DB:', e);
    }
}

check();
