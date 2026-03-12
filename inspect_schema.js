import pg from 'pg';
import fs from 'fs';
import { parse } from 'dotenv';

const env = parse(fs.readFileSync('.env.local'));
const { Client } = pg;
const client = new Client({ connectionString: env.DATABASE_URL });

async function listSchema() {
    try {
        await client.connect();
        const tables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('Tables:', tables.rows.map(r => r.table_name));
        
        for (const table of tables.rows) {
            const columns = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1
            `, [table.table_name]);
            console.log(`Table: ${table.table_name}`, columns.rows);
            
            const fks = await client.query(`
                SELECT
                    tc.table_name, 
                    kcu.column_name, 
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name,
                    rc.delete_rule
                FROM 
                    information_schema.table_constraints AS tc 
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                      AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage AS ccu
                      ON ccu.constraint_name = tc.constraint_name
                      AND ccu.table_schema = tc.table_schema
                    JOIN information_schema.referential_constraints AS rc
                      ON rc.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1;
            `, [table.table_name]);
            if (fks.rows.length > 0) {
                console.log(`FKs for ${table.table_name}:`, fks.rows);
            }
        }
        
        await client.end();
    } catch (e) {
        console.error(e);
    }
}
listSchema();
