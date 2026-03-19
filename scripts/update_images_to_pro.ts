import { sql } from 'drizzle-orm';
import { db } from '../api/_services/db';
import { categories } from '../api/_services/schema';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  console.log('🔄 Actualizando imágenes de las categorías a stock profesional premium...');

  const categoryImages: Record<string, string> = {
    'Masajes': 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?q=80&w=800', // Piedras calientes
    'Pestañas': 'https://images.unsplash.com/photo-1512496015851-a1fbaf6946ed?q=80&w=800', // Lifting / Pestañas
    'Depilación': 'https://images.unsplash.com/photo-1560750588-73207b1ef5b8?q=80&w=800', // Piel tersa / Spa
    'Facial': 'https://images.unsplash.com/photo-1556228720-1c2a4cb5ce8a?q=80&w=800', // Cuidado facial / Cosmética
    'Manicuria': 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?q=80&w=800', // Uñas y manos
    'Psicología': 'https://images.unsplash.com/photo-1573497620053-ea5300f94f21?q=80&w=800', // Espacio terapéutico
    'Reiki': 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800', // Energía, paz
    'Podología': 'https://images.unsplash.com/photo-1519415510236-8a5ad7afbb5a?q=80&w=800' // Cuidado estético de pies
  };

  try {
    const existingCats = await db.select().from(categories);

    for (const cat of existingCats) {
      const matchName = Object.keys(categoryImages).find(k => cat.name.includes(k) || k.includes(cat.name));
      if (matchName) {
        await db.update(categories)
          .set({ image_url: categoryImages[matchName] })
          .where(eq(categories.id, cat.id));
        console.log(`✅ Actualizada imagen de: ${cat.name}`);
      }
    }
    
    console.log('🎉 Todas las imágenes fueron actualizadas con éxito.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error actualizando imágenes:', error);
    process.exit(1);
  }
}

main();
