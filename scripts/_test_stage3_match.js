import { config } from 'dotenv';
config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function test(userText) {
  const userTextNorm = userText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const allServices = await sql`SELECT s.id, s.title, s.price, s.category_id, c.name as category_name 
      FROM services s LEFT JOIN categories c ON s.category_id = c.id WHERE s.active = true`;
  
  const phrases = userTextNorm.split(/\s+y\s+|\s+o\s+|\s+e\s+|,|\.|-|\n/g).map(p => p.trim()).filter(p => p.length > 0);
  // Sort all services by title length DESC
  const sortedServices = [...allServices].sort((a, b) => b.title.length - a.title.length);
  const matched = [];

  for (const s of sortedServices) {
    const t = (s.title || '').replace(/^\d+[\s.]*/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    
    // Check if the service name matches any phrase
    let matchedPhraseIndex = -1;
    for (let i = 0; i < phrases.length; i++) {
        let phrase = " " + phrases[i] + " ";
        if (phrase.includes(" " + t + " ") || phrase.includes(t)) {
            matchedPhraseIndex = i;
            break;
        }

        // Phase 2: significant words matching WITHIN this phrase
        const words = Array.from(new Set(t.split(/[\s+/()]+/).filter(w => w.length > 3)));
        const matchedWords = words.filter(w => phrase.includes(w) || phrase.includes(w.replace(/s$/, ''))); 
        
        let threshold = words.length === 1 ? 1 : 2;
        if (t.includes('combo') || t.includes('pack') || t.includes('promo')) {
          threshold = Math.max(threshold, words.length - 1);
        }
        
        if (words.length > 0 && matchedWords.length >= threshold) {
          matchedPhraseIndex = i;
          // remove matched words from phrase
          for (const w of matchedWords) {
              phrase = phrase.replace(w, " ");
              phrase = phrase.replace(w + 's', " ");
              phrase = phrase.replace(w.replace(/s$/, ''), " ");
          }
          phrases[i] = phrase.trim(); // Update phrase remaining text
          console.log(`DEBUG Match: [${s.title}] threshold=${threshold} matchedWords=${matchedWords.join(',')}`);
          break;
        }
    }

    if (matchedPhraseIndex !== -1) {
        matched.push(s);
        // If exact match removed it, we should remove the whole title from the phrase
        phrases[matchedPhraseIndex] = phrases[matchedPhraseIndex].replace(t, " ").trim();
    }
  }

  // Deduplicate only exact semantic duplicates (just in case they share exactly same length and words)
  const deduped = matched.filter((s, _, arr) => {
    const sTitle = (s.title||'').replace(/^\d+[\s.]*/,'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    const sWords = sTitle.split(/[\s+/()]+/).filter(w => w.length > 3).sort().join(' ');
    
    return !arr.some(o => {
      if (o.id === s.id) return false;
      const otherTitle = (o.title||'').replace(/^\d+[\s.]*/,'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
      const otherWords = otherTitle.split(/[\s+/()]+/).filter(w => w.length > 3).sort().join(' ');
      if (sWords === otherWords && sWords.length > 0) return s.id > o.id;
      return false;
    });
  });

  const total = deduped.reduce((a, s) => a + Number(s.price), 0);
  console.log(`\n📝 "${userText}" → ${deduped.length} servicios:`);
  deduped.forEach(s => console.log(`  • ${s.title} [${s.category_name}]: $${Number(s.price).toLocaleString('es-AR')}`));
  console.log(`  💰 TOTAL: $${total.toLocaleString('es-AR')}`);
}

async function main() {
  await test("brazos completos y masaje de espalda");
}
main().catch(e => console.error(e));
