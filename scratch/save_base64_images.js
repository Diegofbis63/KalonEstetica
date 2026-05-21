import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { categories } from '../api/_services/schema.js';
import fs from 'fs';
import path from 'path';

async function saveImages() {
    try {
        const results = await db.select().from(categories);
        for (const cat of results) {
            if (cat.name.includes('Depilación') || cat.name.includes('Pestañas')) {
                console.log(`Saving images for category: ${cat.name}`);
                if (cat.price_list_url && cat.price_list_url.startsWith('data:image')) {
                    const match = cat.price_list_url.match(/^data:image\/(\w+);base64,(.+)$/);
                    if (match) {
                        const ext = match[1];
                        const data = Buffer.from(match[2], 'base64');
                        const filepath = path.join(process.cwd(), 'scratch', `${cat.slug}_price_list.${ext}`);
                        fs.writeFileSync(filepath, data);
                        console.log(`  Saved price list image to ${filepath}`);
                    }
                }
                if (cat.image_url && cat.image_url.startsWith('data:image')) {
                    const match = cat.image_url.match(/^data:image\/(\w+);base64,(.+)$/);
                    if (match) {
                        const ext = match[1];
                        const data = Buffer.from(match[2], 'base64');
                        const filepath = path.join(process.cwd(), 'scratch', `${cat.slug}_image.${ext}`);
                        fs.writeFileSync(filepath, data);
                        console.log(`  Saved main image to ${filepath}`);
                    }
                }
            }
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

saveImages();
