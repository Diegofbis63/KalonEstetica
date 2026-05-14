import { db } from '../api/_services/db.js';
import * as schema from '../api/_services/schema.js';

async function checkCategories() {
    if (!db) {
        console.log("No DB connection");
        return;
    }
    const cats = await db.select().from(schema.categories);
    console.log("Categories in DB:");
    console.table(cats.map(c => ({
        id: c.id,
        name: c.name,
        price_list_url: c.price_list_url ? "YES" : "NO",
        active: c.active
    })));
}

checkCategories().catch(console.error);
