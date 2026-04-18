import { db } from '../api/_services/db.js';
import * as schema from '../api/_services/schema.js';
import { sql } from 'drizzle-orm';

async function diagnose() {
    console.log('--- DIAGNÓSTICO DE BASE DE DATOS KÂLON ---');
    try {
        const tables = ['leads', 'appointments', 'staff', 'categories', 'services', 'admin_users'];
        for (const table of tables) {
            try {
                const countResult = await db.execute(sql`SELECT count(*) FROM ${sql.identifier(table)}`);
                console.log(`Tabla [${table}]: ${JSON.stringify(countResult)} filas`);
            } catch (err: any) {
                console.log(`Tabla [${table}]: ERROR - ${err.message}`);
            }
        }
    } catch (e: any) {
        console.error('Error fatal en diagnóstico:', e.message);
    }
}

diagnose().then(() => process.exit(0));
