const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

async function run() {
    try {
        const results = await sql`SELECT status, count(*) FROM appointments GROUP BY status`;
        console.log('--- Appointment Statuses ---');
        console.log(results);
        
        const services = await sql`SELECT category_id, count(*) FROM services GROUP BY category_id`;
        console.log('--- Services by Category ---');
        console.log(services);

        const cats = await sql`SELECT id, name FROM categories`;
        console.log('--- Categories ---');
        console.log(cats);
    } catch (e) {
        console.error(e);
    }
}
run();
