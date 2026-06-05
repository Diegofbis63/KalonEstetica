import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { services, categories } from '../api/_services/schema.js';
import { eq } from 'drizzle-orm';

async function listServices() {
    try {
        const cats = await db.select().from(categories);
        const svcs = await db.select().from(services);
        console.log(`Found ${cats.length} categories and ${svcs.length} services.`);
        
        for (const cat of cats) {
            console.log(`\nCategory: ${cat.name} (ID: ${cat.id}, Active: ${cat.active})`);
            const catSvcs = svcs.filter(s => s.category_id === cat.id);
            for (const s of catSvcs) {
                console.log(`  - Service: "${s.name}" (Title: "${s.title}", Price: $${s.price}, Active: ${s.active})`);
            }
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

listServices();
