import { config } from 'dotenv';
config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function test(userText) {
  const userTextNorm = userText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const allServices = await sql`SELECT s.id, s.title, s.price, s.category_id, c.name as category_name 
      FROM services s LEFT JOIN categories c ON s.category_id = c.id WHERE s.active = true`;
  
  // NO category filter - match by name only
  const matched = allServices.filter((s) => {
    const t = (s.title || '').replace(/^\d+[\s.]*/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (userTextNorm.includes(t)) return true;
    const words = t.split(/[\s+/()]+/).filter(w => w.length > 3);
    return words.length <= 2 && words.every(w => userTextNorm.includes(w));
  });

  // Dedup: only within same category
  const deduped = matched.filter((s, _, arr) => {
    const t = (s.title||'').replace(/^\d+[\s.]*/,'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    return !arr.some(o => {
      if (o.id === s.id) return false;
      if (String(o.category_id) !== String(s.category_id)) return false;
      const ot = (o.title||'').replace(/^\d+[\s.]*/,'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
      return ot !== t && ot.includes(t);
    });
  });

  const total = deduped.reduce((a, s) => a + Number(s.price), 0);
  console.log(`\n📝 "${userText}" → ${deduped.length} servicios:`);
  deduped.forEach(s => console.log(`  • ${s.title} [${s.category_name}]: $${Number(s.price).toLocaleString('es-AR')}`));
  console.log(`  💰 TOTAL: $${total.toLocaleString('es-AR')}`);
}

async function main() {
  await test("cejas y laminado de cejas");
  await test("axilas y laminado de cejas");
  await test("lifting de pestañas");
  await test("masaje descontracturante");
}
main().catch(e => console.error(e));
