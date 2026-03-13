import pg from 'pg';
import fs from 'fs';
import { parse } from 'dotenv';

async function migrate() {
    const env = parse(fs.readFileSync('.env.local'));
    const { Client } = pg;
    const client = new Client({ connectionString: env.DATABASE_URL });

    try {
        await client.connect();
        console.log('--- Iniciando migración de Ingresos ---');

        // 1. Agregar columna payment_method a appointments
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='payment_method') THEN
                    ALTER TABLE appointments ADD COLUMN payment_method VARCHAR(50) DEFAULT 'Efectivo';
                END IF;
            END $$;
        `);

        // 2. Opcional: Actualizar estados de 'completed' a 'REALIZADA' para consistencia
        await client.query(`
            UPDATE appointments SET status = 'REALIZADA' WHERE status = 'completed';
        `);
        
        // 3. Opcional: Actualizar 'confirmed' a 'PROGRAMADA' o similar si se desea, 
        // pero el usuario solo pidió que 'Confirmada' en la foto sea 'REALIZADA' en su proyecto.
        // En la base de datos actual parece haber 'confirmed' y 'scheduled'.

        console.log('✅ Migración completada.');
    } catch (e) {
        console.error('❌ Error en migración:', e);
    } finally {
        await client.end();
    }
}

migrate();
