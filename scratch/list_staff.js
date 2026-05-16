import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { staff } from '../api/_services/schema.js';

async function listStaff() {
    try {
        const results = await db.select().from(staff);
        console.log(JSON.stringify(results, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

listStaff();
