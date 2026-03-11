import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local' });

const db = new Pool({ connectionString: process.env.POSTGRES_URL });

async function seed() {
    try {
        const clients = [
            { name: "Lucila Gómez", phone: "1155667788", email: "lucila@mail.com", intent: 80, booked: false, service: "Limpieza Facial Profunda" },
            { name: "Martín Pérez", phone: "1144332211", email: "martin@mail.com", intent: 90, booked: true, service: "Ácido Hialurónico", time: "16:00:00" },
            { name: "Sofía Torres", phone: "1133221144", email: "sofia@mail.com", intent: 100, booked: true, service: "Botox Preventivo", time: "10:30:00" },
            { name: "Diego Fernández", phone: "1166778899", email: "diego@mail.com", intent: 70, booked: false, service: "Masaje Relajante" },
            { name: "Camila Ruiz", phone: "1199887766", email: "camila@mail.com", intent: 95, booked: true, service: "Peeling Químico", time: "18:00:00" },
            { name: "Joaquín Silva", phone: "1122334455", email: "joaquin@mail.com", intent: 65, booked: false, service: "Microblading Cejas" },
            { name: "Valentina M.", phone: "1177889900", email: "vale@mail.com", intent: 100, booked: true, service: "Limpieza Facial Profunda", time: "11:00:00", nextDay: true },
            { name: "Mateo López", phone: "1188776655", email: "mateo@mail.com", intent: 85, booked: false, service: "Ácido Hialurónico" },
            { name: "Julieta Sosa", phone: "1122112233", email: "juli@mail.com", intent: 90, booked: true, service: "Masaje Relajante", time: "14:00:00", nextDay: true },
            { name: "Tomas Herrera", phone: "1133445566", email: "tomas@mail.com", intent: 40, booked: false, service: "Botox Preventivo" }
        ];

        for (const c of clients) {
            const contactInfo = JSON.stringify({ email: c.email, phone: c.phone });
            // insert lead
            const leadRes = await db.query(
                `INSERT INTO leads (client_name, contact_info, intent_score, status) VALUES ($1, $2, $3, $4) RETURNING id`,
                [c.name, contactInfo, c.intent, c.booked ? 'qualified' : 'new']
            );
            const leadId = leadRes.rows[0].id;

            if (c.booked) {
                // calc date based on hoy/mañana
                const d = new Date();
                if (c.nextDay) {
                    d.setDate(d.getDate() + 1);
                }
                const dateStr = d.toISOString().split('T')[0];
                const dateTime = `${dateStr}T${c.time}Z`;

                await db.query(
                    `INSERT INTO appointments (lead_id, date_time, service_type, status) VALUES ($1, $2, $3, $4)`,
                    [leadId, dateTime, c.service, 'scheduled']
                );
            }
        }
        console.log("10 clients seeded perfectly.");
    } catch (e) {
        console.error("Error seeding:", e);
    }
    process.exit(0);
}

seed();
