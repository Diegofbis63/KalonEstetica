import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function testMatching(userText) {
  const userTextNorm = userText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  const cats = await sql`SELECT id, name FROM categories WHERE active = true ORDER BY sort_order`;
  
  // Simular detected_categories del clasificador
  const depilacionId = cats.find(c => c.name.includes('Depilación'))?.id;
  const pestanasId = cats.find(c => c.name.includes('Pestañas'))?.id;
  const detected_categories = [depilacionId, pestanasId].filter(Boolean);
  
  const allServices = await sql`SELECT s.id, s.title, s.price, s.category_id, c.name as category_name 
      FROM services s LEFT JOIN categories c ON s.category_id = c.id 
      WHERE s.active = true`;
  
  const detectedCatIds = new Set(detected_categories.map(String));
  const detectedCatNames = cats
    .filter(c => detectedCatIds.has(String(c.id)))
    .map(c => c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  
  const matchedServices = allServices.filter((s) => {
    const catMatch = detectedCatIds.has(String(s.category_id)) || 
      detectedCatNames.some(cn => (s.category_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(cn));
    if (!catMatch) return false;
    
    const serviceTitle = (s.title || '').replace(/^\d+[\s.]*/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    
    // Fase 1: match exacto del título completo
    if (userTextNorm.includes(serviceTitle)) return true;
    
    // Fase 2: servicios simples (1-2 palabras significativas)
    const significantWords = serviceTitle.split(/[\s+/()]+/).filter(w => w.length > 3);
    if (significantWords.length <= 2) {
      return significantWords.every(w => userTextNorm.includes(w));
    }
    
    return false;
  });
  
  console.log(`\n📝 Input: "${userText}"`);
  console.log(`✅ Matched ${matchedServices.length} servicios:`);
  const total = matchedServices.reduce((acc, s) => acc + Number(s.price), 0);
  for (const s of matchedServices) {
    console.log(`  • ${s.title}: $${Number(s.price).toLocaleString('es-AR')}`);
  }
  console.log(`  💰 TOTAL: $${total.toLocaleString('es-AR')}`);
  return matchedServices;
}

async function main() {
  await testMatching("axilas y laminado de cejas");
  await testMatching("lifting de pestañas");
  await testMatching("limpieza facial profunda y masaje mandibular");
}

main().catch(e => console.error(e.message));
