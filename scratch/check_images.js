import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { categories } from '../api/_services/schema.js';

async function checkImages() {
    try {
        const results = await db.select({
            id: categories.id,
            name: categories.name,
            image_url: categories.image_url,
            price_list_url: categories.price_list_url
        }).from(categories);
        for (const cat of results) {
            console.log(`Name: ${cat.name}`);
            console.log(`  image_url: ${cat.image_url}`);
            console.log(`  price_list_url: ${cat.price_list_url}`);
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkImages();
