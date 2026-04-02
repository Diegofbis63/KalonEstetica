import { db } from "../api/_services/db.js";
import { appointments, leads } from "../api/_services/schema.js";
import { eq, ilike, or } from "drizzle-orm";

async function auditAppointments() {
  console.log("--- Auditando Citas de 'Diego Federico' ---");
  
  const results = await db.select({
    id: appointments.id,
    customerName: leads.full_name,
    status: appointments.status,
    totalPrice: appointments.total_price,
    date: appointments.appointment_date,
    serviceDetails: appointments.service_details
  })
  .from(appointments)
  .leftJoin(leads, eq(appointments.lead_id, leads.id))
  .where(
    or(
      ilike(leads.full_name, "%Diego%"),
      ilike(leads.full_name, "%Federico%")
    )
  );

  if (results.length === 0) {
    console.log("No se encontraron citas para clientes con 'Diego' o 'Federico' en el nombre.");
  } else {
    console.table(results);
  }

  console.log("\n--- Auditando Estados de Citas en General ---");
  const allStatuses = await db.select({
    status: appointments.status,
    count: appointments.id
  }).from(appointments);
  
  const statusCounts = allStatuses.reduce((acc: any, curr) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1;
    return acc;
  }, {});

  console.log("Resumen de estados en la DB:", statusCounts);

  process.exit(0);
}

auditAppointments().catch(err => {
  console.error(err);
  process.exit(1);
});
