
import { db } from './db/index';
import { categories } from './db/schema';
import { eq } from 'drizzle-orm';

async function updateCategory() {
  console.log('UPDATING CATEGORY...');
  const result = await db.update(categories)
    .set({ 
      name: 'Manicuria y Pedicuria', 
      slug: 'manicuria-y-pedicuria' 
    })
    .where(eq(categories.name, 'Manicuria'))
    .returning();
  
  console.log('RESULT:', result);
  process.exit(0);
}

updateCategory().catch(err => {
  console.error(err);
  process.exit(1);
});
