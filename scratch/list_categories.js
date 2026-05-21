import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { categories } from '../api/_services/schema.js';

async function listCats() {
    try {
        const results = await db.select().from(categories);
        for (const cat of results) {
            console.log(`ID: ${cat.id} | Name: ${cat.name} | Slug: ${cat.slug}`);
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

listCats();
