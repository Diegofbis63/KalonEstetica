import { neon } from '@neondatabase/serverless';

const db_url = "***REMOVED***";
const sql_query = neon(db_url);

async function run_query() {
    const raw_query = process.argv.slice(2).join(' ');
    if (!raw_query) {
        console.log("Provide query");
        return;
    }
    try {
        // Use tagged template workaround for dynamic query
        const result = await sql_query(raw_query as any);
        console.log(JSON.stringify(result, null, 2));
    } catch (err) {
        console.error("Error:", err);
    }
}

run_query();
