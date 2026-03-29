import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../api/_services/schema.js';
import 'dotenv/config';

async function audit() {
    const sql = neon(process.env.DATABASE_URL!);
    const db = drizzle(sql, { schema });

    console.log("--- AUDITORÍA DE DATOS KALON ---");
    
    const categories = await db.query.categories.findMany();
    console.log(`\nCategorías (${categories.length}):`);
    categories.forEach(c => {
        console.log(`- [${c.id}] ${c.name} (Activa: ${c.active}, Orden: ${c.sort_order})`);
    });

    const services = await db.query.services.findMany({
        with: { category: true }
    });
    console.log(`\nServicios (${services.length}):`);
    services.slice(0, 10).forEach(s => {
        console.log(`- ${s.title} -> Categoría: ${s.category?.name || 'NINGUNA'}`);
    });
}

audit().catch(console.error);
