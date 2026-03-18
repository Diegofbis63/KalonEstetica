
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    const sql = neon(process.env.DATABASE_URL!);
    // Buscamos el último lead actualizado que sea de fuente 'web' y tenga logs recientes
    const results = await sql`
        SELECT l.id, l.client_name, l.contact_info, l.updated_at, cl.role, cl.content 
        FROM leads l
        JOIN chat_logs cl ON l.id = cl.lead_id
        WHERE l.updated_at > NOW() - INTERVAL '15 minutes'
        ORDER BY cl.created_at DESC
        LIMIT 20;
    `;
    console.log(JSON.stringify(results, null, 2));
}

check();
