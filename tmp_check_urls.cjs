
const { neon } = require('@neondatabase/serverless');

const url = "***REMOVED***";
const sql = neon(url);

async function check() {
    console.log("--- Categories ---");
    const cats = await sql`SELECT name, image_url FROM categories`;
    console.log(JSON.stringify(cats, null, 2));

    console.log("\n--- Services ---");
    const svcs = await sql`SELECT title, image_url FROM services WHERE title ILIKE '%pestaña%'`;
    console.log(JSON.stringify(svcs, null, 2));
}

check().catch(console.error);
