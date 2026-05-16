import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { staff_specialties } from '../api/_services/schema.js';

async function listSpecialties() {
    try {
        const results = await db.select().from(staff_specialties);
        console.log(JSON.stringify(results, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

listSpecialties();
