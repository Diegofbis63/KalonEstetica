
import { db } from './api/_services/db.js';
import * as schema from './api/_services/schema.js';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    const catsTotal = await db.select({ count: sql`count(*)` }).from(schema.categories);
    const servsTotal = await db.select({ count: sql`count(*)` }).from(schema.services);
    const servsActive = await db.select({ count: sql`count(*)` }).from(schema.services).where(sql`active = true`);
    
    console.log('Categories Total:', catsTotal[0].count);
    console.log('Services Total:', servsTotal[0].count);
    console.log('Services Active:', servsActive[0].count);
    
    const sampleCats = await db.query.categories.findMany({ limit: 5 });
    console.log('Sample Categories:', JSON.stringify(sampleCats, null, 2));
    
  } catch (e) {
    console.error('DB Error:', e);
  }
}

main();
