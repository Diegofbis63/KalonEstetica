
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '../api/_services/schema';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

config({ path: '.env.local' });
config(); // fallback for .env

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || '');
const db = drizzle(sql, { schema });

function toSlug(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
}

async function main() {
  console.log('--- 🌱 Starting Real Data Seed (KÂLON) ---');
  
  const rawData = fs.readFileSync(path.join(process.cwd(), 'data', 'initial_services.json'), 'utf-8');
  const data = JSON.parse(rawData);
  
  if (!data.services_structure) {
    console.error('❌ services_structure not found in JSON');
    process.exit(1);
  }

  // 1. Cleaning services first to avoid FK constraints before categories
  console.log('Cleaning existing services and categories...');
  await db.delete(schema.services);
  await db.delete(schema.categories);

  let categoryOrder = 0;
  for (const [catName, subServices] of Object.entries(data.services_structure)) {
    console.log(`Processing category: ${catName}...`);
    
    // Create Category
    const [category] = await db.insert(schema.categories).values({
      name: catName,
      slug: toSlug(catName),
      active: true,
      sort_order: (categoryOrder++) * 10,
    }).returning();

    // Create Services
    let serviceOrder = 0;
    const servicesToInsert = (subServices as any[]).map(s => ({
      category_id: category.id,
      category: catName, // legacy column
      title: s.name,
      price: s.price.toString(),
      duration_min: s.duration_min,
      duration: `${s.duration_min} min`, // legacy column
      active: true,
      sort_order: (serviceOrder++) * 10,
    }));

    if (servicesToInsert.length > 0) {
      await db.insert(schema.services).values(servicesToInsert);
      console.log(`Inserted ${servicesToInsert.length} services for ${catName}.`);
    }
  }

  console.log('✅ Base de datos "KÂLON Estética" sincronizada con éxito!');
}

main().catch(err => {
  console.error('❌ SEED ERROR:', err);
  process.exit(1);
});
