
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../api/_services/schema.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function check() {
    const svcs = await db.select().from(schema.services);
    const withImg = svcs.filter(s => s.image_url);
    console.log(`Total Services: ${svcs.length}, With Image: ${withImg.length}`);
    if (withImg.length > 0) {
        console.log('Sample Image URL:', withImg[0].image_url);
    }

    const cats = await db.select().from(schema.categories);
    const catWithImg = cats.filter(c => c.price_list_url || c.image_url);
    console.log(`Total Categories: ${cats.length}, With Image/PriceList: ${catWithImg.length}`);
    if (catWithImg.length > 0) {
        console.log('Sample Cat URL:', catWithImg[0].price_list_url || catWithImg[0].image_url);
    }

    const config = await db.select().from(schema.business_config);
    console.log('Config keys:', config.map(c => c.key));

    process.exit(0);
}

check();
