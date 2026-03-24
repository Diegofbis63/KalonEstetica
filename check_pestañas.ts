import 'dotenv/config';

async function run() {
    try {
        const { db } = await import('./api/_services/db.js');
        const schema = await import('./api/_services/schema.js');
        const { eq } = await import('drizzle-orm');

        const cat = await db.query.categories.findFirst({
            where: eq(schema.categories.name, 'Pestañas')
        });
        console.log("Pestañas Category:", JSON.stringify(cat, null, 2));

        const all = await db.query.categories.findMany();
        console.log("All Categories:", JSON.stringify(all.map(c => ({ id: c.id, name: c.name, image_url: c.image_url?.substring(0, 50) })), null, 2));
    } catch (e) {
        console.error(e);
    }
}

run();
