import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { categories } from '../api/_services/schema.js';

async function checkLite() {
    try {
        const results = await db.select().from(categories);
        for (const cat of results) {
            console.log(`\nCategory: ${cat.name} (Slug: ${cat.slug})`);
            console.log(`  ID: ${cat.id}`);
            console.log(`  image_url length: ${cat.image_url?.length || 0}`);
            console.log(`  image_url preview: ${cat.image_url?.substring(0, 100)}...`);
            console.log(`  price_list_url length: ${cat.price_list_url?.length || 0}`);
            console.log(`  price_list_url preview: ${cat.price_list_url?.substring(0, 100)}...`);
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkLite();
