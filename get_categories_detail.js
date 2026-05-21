import 'dotenv/config';
import { db } from './api/_services/db.js';
import * as schema from './api/_services/schema.js';

async function run() {
    const categories = await db.select().from(schema.categories);
    console.log("CATEGORIES SUMMARY:");
    categories.forEach(c => {
        console.log(`\n- Name: ${c.name}`);
        console.log(`  ID: ${c.id}`);
        console.log(`  image_url length: ${c.image_url ? c.image_url.length : 0}`);
        if (c.image_url) {
            console.log(`  image_url start: ${c.image_url.substring(0, 100)}...`);
        }
        console.log(`  price_list_url length: ${c.price_list_url ? c.price_list_url.length : 0}`);
        if (c.price_list_url) {
            console.log(`  price_list_url start: ${c.price_list_url.substring(0, 100)}...`);
        }
    });
    process.exit(0);
}

run().catch(console.error);
