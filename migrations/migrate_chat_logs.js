import pg from 'pg';
import fs from 'fs';
import { parse } from 'dotenv';

const env = parse(fs.readFileSync('.env.local'));
const { Client } = pg;
const client = new Client({ connectionString: env.DATABASE_URL });

async function runMigration() {
    try {
        await client.connect();
        console.log('--- Iniciando Migración: chat_logs y Cascada ---');
        
        // 1. Crear tabla chat_logs con ON DELETE CASCADE
        console.log('Creando tabla chat_logs...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS chat_logs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
                role VARCHAR(50) NOT NULL, -- 'user', 'bot', 'admin'
                content TEXT,
                media_url TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tabla chat_logs creada y vinculada con CASCADE.');

        // 2. Migrar datos existentes desde leads.chat_history (si hay)
        console.log('Migrando mensajes existentes...');
        const leadsRes = await client.query('SELECT id, chat_history FROM leads WHERE chat_history IS NOT NULL AND chat_history != \'[]\'::jsonb');
        
        let migratedCount = 0;
        for (const lead of leadsRes.rows) {
            const history = Array.isArray(lead.chat_history) ? lead.chat_history : [];
            for (const msg of history) {
                await client.query(`
                    INSERT INTO chat_logs (lead_id, role, content, media_url, created_at)
                    VALUES ($1, $2, $3, $4, $5)
                `, [lead.id, msg.role, msg.content, msg.media_url || null, msg.created_at || new Date().toISOString()]);
                migratedCount++;
            }
        }
        console.log(`✅ ${migratedCount} mensajes migrados con éxito.`);

        // 3. Crear índice para búsquedas rápidas
        await client.query('CREATE INDEX IF NOT EXISTS idx_chat_logs_lead_id ON chat_logs(lead_id);');
        
        await client.end();
        console.log('--- Migración Completada ---');
    } catch (e) {
        console.error('❌ Error en migración:', e);
        process.exit(1);
    }
}
runMigration();
