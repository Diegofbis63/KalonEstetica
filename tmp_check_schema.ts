
import { getDb } from './api/utils/db.ts';
import dotenv from 'dotenv';
dotenv.config();

async function checkSchema() {
    const db = getDb();
    try {
        const res = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'leads'");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

checkSchema();
