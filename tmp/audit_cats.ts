
import { neon } from '@neondatabase/serverless';
const sql = neon("***REMOVED***");

async function audit() {
    const res = await sql`SELECT id, name, slug FROM categories`;
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
}
audit();
