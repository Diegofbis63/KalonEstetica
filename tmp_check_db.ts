
import { db } from './api/_services/db';
import { categories, services } from './api/_services/schema';

async function checkImages() {
    console.log("--- Categories ---");
    const cats = await db.select().from(categories);
    cats.forEach(c => {
        console.log(`- ${c.name}: ${c.image_url}`);
    });

    console.log("\n--- Services ---");
    const svcs = await db.select().from(services);
    svcs.forEach(s => {
        console.log(`- ${s.title}: ${s.image_url}`);
    });
}

checkImages().catch(console.error);
