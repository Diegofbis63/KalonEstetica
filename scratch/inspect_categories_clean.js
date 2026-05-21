import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { categories } from '../api/_services/schema.js';
import fs from 'fs';

async function inspect() {
    try {
        const cats = await db.select().from(categories);
        const data = cats.map(cat => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            image_url: cat.image_url,
            price_list_url: cat.price_list_url,
            active: cat.active,
            sort_order: cat.sort_order
        }));
        fs.writeFileSync('scratch/categories_clean.json', JSON.stringify(data, null, 2));
        console.log(`Saved ${data.length} categories to scratch/categories_clean.json`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspect();
