
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../api/_services/schema.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

import { eq, desc, asc } from 'drizzle-orm';

async function monitor() {
    console.log('\n--- 🕒 ÚLTIMOS LOGS DEL SISTEMA (Neon) ---');
    const systemLogs = await db.select().from(schema.system_logs)
        .orderBy(desc(schema.system_logs.created_at))
        .limit(5);
    
    if (systemLogs.length === 0) console.log('Sin logs de sistema recientes.');
    systemLogs.forEach(log => {
        console.log(`[${log.created_at?.toISOString()}] ${log.level?.toUpperCase()}: ${log.message}`);
    });

    console.log('\n--- 💬 ÚLTIMOS MENSAJES DEL CHAT ---');
    const chatLogs = await db.select().from(schema.chat_logs)
        .orderBy(desc(schema.chat_logs.created_at))
        .limit(10);

    if (chatLogs.length === 0) console.log('Sin mensajes recientes.');
    chatLogs.forEach(chat => {
        const role = chat.role === 'user' ? '👤 CLIENTE' : '🤖 BOT';
        console.log(`[${chat.created_at?.toISOString()}] ${role}: ${chat.content?.substring(0, 100)}${chat.content && chat.content.length > 100 ? '...' : ''}`);
    });

    console.log('\n--- 📊 ESTADO DE LEADS RECIENTES ---');
    const recentLeads = await db.select().from(schema.leads)
        .orderBy(desc(schema.leads.updated_at))
        .limit(3);

    
    recentLeads.forEach(lead => {
        console.log(`Lead: ${lead.client_name} | Status: ${lead.status} | Último cambio: ${lead.updated_at?.toISOString()}`);
    });

    process.exit(0);
}

monitor().catch(err => {
    console.error('Error monitoreando DB:', err);
    process.exit(1);
});
