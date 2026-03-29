import { db } from '../api/_services/db.js';
import * as schema from '../api/_services/db/schema.js';
import { count, eq } from 'drizzle-orm';

async function diagnose() {
    console.log("--- Diagnóstico de Servicios por Categoría ---");
    try {
        const categories = await db.query.categories.findMany();
        for (const cat of categories) {
            const servicesCount = await db.select({ value: count() })
                .from(schema.services)
                .where(eq(schema.services.category_id, cat.id));
            console.log(`${cat.name}: ${servicesCount[0].value} servicios`);
        }
    } catch (e) {
        console.error("Error en diagnóstico:", e);
    }
}

diagnose().catch(console.error);
