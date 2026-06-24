import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkDepilacionServices() {
  const { db } = await import('../api/_services/db.js');
  const schema = await import('../api/_services/schema.js');
  const { eq } = await import('drizzle-orm');

  if (!db) {
    console.error("Database connection not initialized.");
    return;
  }
  
  try {
    const services = await db.select().from(schema.services)
      .where(eq(schema.services.category_id, 'f2f5dccc-d6d7-433b-8372-965abf38d561'));
      
    console.log("=== SERVICES UNDER 'DEPILACIÓN' ===");
    console.log(`Total services: ${services.length}`);
    services.forEach((s: any) => {
      console.log(`ID: ${s.id} | Title: ${s.title} | Price: $${s.price} | Active: ${s.active}`);
    });
  } catch (e: any) {
    console.error("Error executing query:", e);
  }
}

checkDepilacionServices();
