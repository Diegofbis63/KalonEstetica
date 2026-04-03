
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '../api/_services/schema';
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';

config({ path: '.env.local' });

const neonSql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || '');
const db = drizzle(neonSql, { schema });

async function audit() {
  console.log('--- 🔍 KÂLON ADMIN DATA AUDIT ---');

  // 1. Configuration (Staff & Users)
  const staff = await db.select().from(schema.staff);
  const users = await db.select().from(schema.admin_users);
  console.log(`\n[CONFIGURACION]`);
  console.log(`- Staff Count: ${staff.length}`);
  console.log(`- Admin Users: ${users.length} (${users.map(u => u.username).join(', ')})`);

  // 2. Services & Categories
  const categories = await db.query.categories.findMany({ with: { services: true } });
  console.log(`\n[SERVICIOS]`);
  console.log(`- Categories Count: ${categories.length}`);
  categories.forEach(cat => {
    console.log(`  * ${cat.name}: ${cat.services?.length || 0} services`);
  });

  // 3. Clients (Leads)
  const leads = await db.select().from(schema.leads);
  console.log(`\n[CLIENTES]`);
  console.log(`- Total Clients (Leads): ${leads.length}`);

  // 4. Appointments & Management
  const appointments = await db.select().from(schema.appointments);
  const statuses = [...new Set(appointments.map(a => a.status?.toLowerCase()))];
  console.log(`\n[GESTION DE CITAS]`);
  console.log(`- Total Appointments: ${appointments.length}`);
  console.log(`- Detected Statuses: ${statuses.join(', ')}`);
  
  const completed = appointments.filter(a => 
    ['realizada', 'concluida', 'pagada', 'confirmed', 'completada', 'completado', 'finalizada', 'servido'].includes(a.status?.toLowerCase() || '')
  );
  console.log(`- Completed/Realized: ${completed.length}`);
  
  const potentials = appointments.filter(a => 
    ['new', 'pending', 'confirmed', 'scheduled', 'prospecto', 'potential'].includes(a.status?.toLowerCase() || '')
  );
  console.log(`- Potential/New/Scheduled: ${potentials.length}`);

  // 5. Income check
  const totalRevenue = completed.reduce((acc, a) => acc + Number(a.total_price || 0), 0);
  console.log(`\n[INGRESOS]`);
  console.log(`- Calculated Total Revenue: $${totalRevenue}`);
  
  console.log('\n--- AUDIT COMPLETE ---');
}

audit().catch(console.error);
