
import { neon } from '@neondatabase/serverless';

const url = "***REMOVED***";
const sql = neon(url);

async function run() {
    try {
        console.log("--- CATEGORIES ---");
        const c = await sql`SELECT id, name, image_url FROM categories`;
        console.log(JSON.stringify(c, null, 2));
    } catch (e) {
        console.error(e);
    }
}

run();
