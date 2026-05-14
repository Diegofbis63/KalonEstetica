import { db, schema } from '../api/_services/db.js';

async function check() {
    try {
        const users = await db.query.admin_users.findMany();
        console.log('ADMIN USERS:', JSON.stringify(users, null, 2));
    } catch (e) {
        console.error('ERROR FETCHING USERS:', e);
    }
}

check();
