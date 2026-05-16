import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { admin_users } from '../api/_services/schema.js';

async function listUsers() {
    try {
        const results = await db.select().from(admin_users);
        console.log(JSON.stringify(results, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

listUsers();
