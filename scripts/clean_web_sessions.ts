import { sql } from '../api/_services/db.js';

async function verifyWebSessions() {
    try {
        const results = await sql`SELECT id, client_name, contact_info FROM leads ORDER BY updated_at DESC LIMIT 10`;
        console.log("LEADS RECIENTES:");
        results.forEach(r => console.log(JSON.stringify(r)));
        
        // Also let's just wipe anything that doesn't have a valid WhatsApp number so we really clean it:
        const delRes = await sql`DELETE FROM leads WHERE client_name = 'Cliente' OR contact_info->>'uuid' IS NOT NULL RETURNING id`;
        console.log(`\n✅ ¡Limpieza agresiva! Se eliminaron ${delRes.length} sesiones incompletas.`);
    } catch (e) {
        console.error(e);
    }
}

verifyWebSessions().then(() => process.exit(0));
