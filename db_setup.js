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

    console.log('Creating tables...');

    await client.query(`
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- admin_users table
    CREATE TABLE IF NOT EXISTS admin_users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Leads
    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organization_id UUID,
      client_name VARCHAR(255) NOT NULL,
      contact_info JSONB,
      intent_score INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'new',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Appointments
    CREATE TABLE IF NOT EXISTS appointments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
      organization_id UUID,
      date_time TIMESTAMP WITH TIME ZONE NOT NULL,
      service_type VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'scheduled',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Services
    CREATE TABLE IF NOT EXISTS services (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      price NUMERIC(10, 2),
      duration VARCHAR(50),
      image_url TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

    console.log('Tables created successfully.');
    await client.end();
}

main().catch(console.error);
