import pg from 'pg';
import { readFileSync } from 'fs';
import { parse } from 'dotenv';

// Read .env.local
const envConfig = parse(readFileSync('.env.local'));
for (const k in envConfig) {
    process.env[k] = envConfig[k];
}

const { Client } = pg;
const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    await client.connect();
    console.log('--- Configurando Base de Datos KÂLON ---');

    // 1. Extensiones
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    // 2. Tablas Base
    console.log('Verificando y creando tablas si no existen...');

    // admin_users
    await client.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // leads
    await client.query(`
        CREATE TABLE IF NOT EXISTS leads (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          organization_id UUID,
          client_name VARCHAR(255) NOT NULL,
          contact_info JSONB,
          intent_score INTEGER DEFAULT 0,
          status VARCHAR(50) DEFAULT 'new',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // appointments
    await client.query(`
        CREATE TABLE IF NOT EXISTS appointments (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
          organization_id UUID,
          date_time TIMESTAMP WITH TIME ZONE NOT NULL,
          service_type VARCHAR(255) NOT NULL,
          status VARCHAR(50) DEFAULT 'scheduled',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // services
    await client.query(`
    -- Services
    CREATE TABLE IF NOT EXISTS services (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      category VARCHAR(255),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      price NUMERIC(10, 2),
      duration VARCHAR(50),
      image_url TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    `);

    // 3. Verificación y Alteración de Columnas Faltantes
    console.log('Verificando integridad de columnas...');

    // LEADS missing columns
    await client.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='is_bot_enabled') THEN
                ALTER TABLE leads ADD COLUMN is_bot_enabled BOOLEAN DEFAULT true;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='chat_history') THEN
                ALTER TABLE leads ADD COLUMN chat_history JSONB DEFAULT '[]';
            END IF;
        END $$;
    `);

    // SERVICES missing columns
    await client.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='sort_order') THEN
                ALTER TABLE services ADD COLUMN sort_order INTEGER DEFAULT 0;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='category') THEN
                ALTER TABLE services ADD COLUMN category VARCHAR(255);
            END IF;
        END $$;
    `);

    // APPOINTMENTS missing columns (double check)
    await client.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='organization_id') THEN
                ALTER TABLE appointments ADD COLUMN organization_id UUID;
            END IF;
        END $$;
    `);

    console.log('✅ Base de datos configurada e íntegra.');
    await client.end();
}

main().catch(error => {
    console.error('❌ Error configurando la base de datos:', error);
    process.exit(1);
});
