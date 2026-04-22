import dotenv from 'dotenv';
dotenv.config();

// IMPORT DB AFTER CONFIG!
import { sql } from '../api/_services/db.js';

async function checkLeads() {
    console.log('--- DATABASE STATUS CHECK ---');
    try {
        // 1. Check leads
        const leads = await sql`SELECT id, name, full_name, status, created_at FROM leads ORDER BY created_at DESC LIMIT 10`;
        console.log('\nRECENT LEADS:');
        console.table(leads);

        if (leads.length === 0) {
            console.log('ALERT: LEADS TABLE IS EMPTY!');
        } else {
            console.log(`FOUND ${leads.length} LEADS.`);
        }

        // 2. Check table structure
        const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
        console.log('\nEXISTING TABLES:');
        console.table(tables.map((t: any) => t.table_name));

    } catch (error) {
        console.error('DATABASE ERROR:', error);
    }
}

checkLeads();
