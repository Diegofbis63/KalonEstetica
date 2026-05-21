import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { categories } from '../api/_services/schema.js';

async function inspect() {
    try {
        const cats = await db.select().from(categories);
        console.log(`Total categories: ${cats.length}`);
        for (const cat of cats) {
            console.log(`ID: ${cat.id}`);
            console.log(`  Name: ${cat.name}`);
            console.log(`  Slug: ${cat.slug}`);
            console.log(`  Image URL: ${cat.image_url}`);
            console.log(`  Price List URL: ${cat.price_list_url}`);
            console.log(`  Active: ${cat.active}`);
            console.log(`  Sort Order: ${cat.sort_order}`);
            console.log('-----------------------------------');
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspect();
