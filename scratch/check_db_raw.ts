import dotenv from 'dotenv';
dotenv.config();

import { neon } from '@neondatabase/serverless';

async function checkLeadsRaw() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error('DATABASE_URL NOT FOUND IN ENV');
        return;
    }
    console.log('--- RAW DATABASE CHECK v2 ---');
    
    try {
        const sql = neon(url);
        
        // Use tagged template
        const leads = await sql`SELECT id, name, full_name, status, created_at FROM leads ORDER BY created_at DESC LIMIT 10`;
        console.log('\nRECENT LEADS:');
        console.table(leads);

        const countRes = await sql`SELECT COUNT(*) FROM leads`;
        console.log('\nTOTAL LEADS:', countRes[0].count);

    } catch (error) {
        console.error('RAW DATABASE ERROR:', error);
    }
}

checkLeadsRaw();
