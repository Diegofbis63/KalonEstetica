import { db } from '../api/_services/db.js';
import * as schema from '../api/_services/schema.js';
import { eq } from 'drizzle-orm';

async function resetAdminPassword() {
    if (!db) {
        console.log("No DB connection");
        return;
    }
    const newPassword = 'admin123';
    await db.update(schema.admin_users)
        .set({ 
            password_hash: newPassword, // fallback works in admin.ts
            raw_password: newPassword 
        })
        .where(eq(schema.admin_users.username, 'gabriela_adm_x79'));
    
    console.log("Password for 'gabriela_adm_x79' has been reset to: " + newPassword);
}

resetAdminPassword().catch(console.error);
