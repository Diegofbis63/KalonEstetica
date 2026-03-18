
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function audit() {
    const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || '');
    try {
        const catCount = await sql`SELECT count(*) FROM categories`;
        const svcCount = await sql`SELECT count(*) FROM services`;
        const leadCount = await sql`SELECT count(*) FROM leads`;
        
        console.log('--- DB AUDIT (RAW SQL) ---');
        console.log('Categories:', catCount[0].count);
        console.log('Services:', svcCount[0].count);
        console.log('Leads:', leadCount[0].count);
        
        const cats = await sql`SELECT id, name, slug, active FROM categories LIMIT 5`;
        console.log('Category samples:', JSON.stringify(cats, null, 2));

    } catch (e) {
        console.error('AUDIT ERROR:', e);
    }
    process.exit(0);
}

audit();
