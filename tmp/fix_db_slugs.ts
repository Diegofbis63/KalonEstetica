
import { neon } from '@neondatabase/serverless';
const sql = neon("***REMOVED***");

const normalize = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, '-');

async function fix() {
    try {
        const cats = await sql`SELECT id, name, slug FROM categories`;
        for (const cat of cats) {
            const expected = normalize(cat.name);
            if (cat.slug !== expected) {
                console.log(`Fixing ${cat.name}: ${cat.slug} -> ${expected}`);
                await sql`UPDATE categories SET slug = ${expected} WHERE id = ${cat.id}`;
            }
        }
    } catch (e) {
        console.error('ERROR:', e);
    }
    process.exit(0);
}
fix();
