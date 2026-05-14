import { db } from '../api/_services/db.js';
import * as schema from '../api/_services/schema.js';

async function checkAdminUsers() {
    if (!db) {
        console.log("No DB connection");
        return;
    }
    const users = await db.select().from(schema.admin_users);
    console.log("Admin Users in DB:");
    console.table(users.map(u => ({
        id: u.id,
        username: u.username,
        has_hash: u.password_hash ? "YES" : "NO",
        has_raw: u.raw_password ? "YES" : "NO",
        role: u.role
    })));
}

checkAdminUsers().catch(console.error);
