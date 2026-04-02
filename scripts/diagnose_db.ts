
import { db } from '../api/_services/db.js';
import * as schema from '../api/_services/schema.js';
import { sql, eq } from 'drizzle-orm';

async function diagnose() {
  console.log('--- DIAGNÓSTICO DE BASE DE DATOS ---');
  
  try {
    // 1. Contar citas y ver estados únicos
    const statusCounts = await db.select({
      status: schema.appointments.status,
      count: sql`count(*)`
    }).from(schema.appointments)
    .groupBy(schema.appointments.status);
    
    console.log('Distribución de Estados en Appointments:');
    console.table(statusCounts);

    // 2. Buscar a "Diego Federico"
    const diegoLeads = await db.select().from(schema.leads)
      .where(sql`client_name ILIKE '%Diego Federico%'`);
    
    console.log('\nLeads encontrados para "Diego Federico":');
    console.table(diegoLeads);

    if (diegoLeads.length > 0) {
      for (const lead of diegoLeads) {
        const apps = await db.select().from(schema.appointments)
          .where(eq(schema.appointments.lead_id, lead.id));
        
        console.log(`\nCitas para Lead ID ${lead.id} (${lead.client_name}):`);
        console.table(apps.map(a => ({
          id: a.id,
          status: a.status,
          total_price: a.total_price,
          date_time: a.date_time
        })));
      }
    }

    // 3. Verificar si hay citas "huérfanas" (sin lead_id válido)
    const [orphanApps] = await db.select({ count: sql`count(*)` })
      .from(schema.appointments)
      .leftJoin(schema.leads, eq(schema.appointments.lead_id, schema.leads.id))
      .where(sql`${schema.leads.id} IS NULL`);
    
    console.log('\nCitas sin Lead (Huérfanas):', orphanApps.count);

    // 4. Ver los primeros 5 registros de appointments para ver el formato de total_price
    const samples = await db.select().from(schema.appointments).limit(5);
    console.log('\nMuestra de Appointments:');
    console.table(samples.map(a => ({
      status: a.status,
      total_price: a.total_price,
      raw_price_type: typeof a.total_price
    })));

  } catch (error) {
    console.error('Error durante el diagnóstico:', error);
  } finally {
    process.exit(0);
  }
}

diagnose();
