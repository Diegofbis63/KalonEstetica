
import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function run_query() {
    const query = process.argv[2];
    if (!query) {
        console.log("Please provide a query as an argument.");
        return;
    }
    try {
        const result = await sql(query);
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}

run_query();
