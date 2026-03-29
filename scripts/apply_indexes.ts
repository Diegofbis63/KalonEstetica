import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'path';
import { neon } from '@neondatabase/serverless';

// Cargar .env.local explícitamente si existe
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  console.error("No DATABASE_URL found");
  process.exit(1);
}

// Log masked connection string for debugging
const masked = connectionString.replace(/:([^@]+)@/, ":****@");
console.log(`🔗 Usando conexión: ${masked}`);

const sql = neon(connectionString);

async function applyIndexes() {
  console.log("🚀 Aplicando índices de rendimiento en Neon...");
  
  try {
    // 1. Índice para búsquedas por teléfono en leads
    console.log("- Creando índice para teléfonos...");
    await sql`CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads ((contact_info->>'phone'))`;

    // 2. Índice para initId (Identificación de sesión)
    console.log("- Creando índice para initId...");
    await sql`CREATE INDEX IF NOT EXISTS idx_leads_initid ON leads ((contact_info->>'initId'))`;

    // 3. Índice para foreign keys frecuentes
    console.log("- Creando índice para logs de chat...");
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_logs_lead_id ON chat_logs (lead_id)`;

    console.log("- Creando índice para turnos...");
    await sql`CREATE INDEX IF NOT EXISTS idx_appointments_lead_id ON appointments (lead_id)`;

    console.log("✅ Índices aplicados exitosamente.");
  } catch (err) {
    console.error("❌ Error aplicando índices:", err);
  }
}

applyIndexes();
