import { db } from "../api/_services/db";
import { sql } from "drizzle-orm";

async function findData() {
  console.log("--- BUSCANDO DATOS PERDIDOS ---");
  
  try {
    // 1. Listar todas las tablas
    const tables = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log("Tablas encontradas:", tables.rows.map(r => r.table_name));

    for (const table of tables.rows) {
      const tableName = table.table_name as string;
      const countRes = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM "${tableName}"`));
      console.log(`Tabla ${tableName}: ${countRes.rows[0].count} filas`);
      
      if (tableName === 'appointments' || tableName === 'citas') {
        const samples = await db.execute(sql.raw(`SELECT * FROM "${tableName}" LIMIT 1`));
        console.log(`Muestra de ${tableName}:`, JSON.stringify(samples.rows[0], null, 2));
      }
    }

  } catch (error) {
    console.error("Error buscando datos:", error);
  }
}

findData();
