import { db } from '../api/_services/db.js';
import * as schema from '../api/_services/schema.js';
import { sql } from 'drizzle-orm';

async function checkConfig() {
    console.log('--- REVISANDO CONFIGURACIÓN DE IMAGEN ---');
    try {
        const results = await db.execute(sql`SELECT * FROM business_config`);
        console.log('Contenido de business_config:', JSON.stringify(results.rows, null, 2));
    } catch (e: any) {
        console.error('Error leyendo config:', e.message);
    }
}

checkConfig().then(() => process.exit(0));
