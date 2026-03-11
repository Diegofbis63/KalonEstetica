require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
});

const generateRandomPastDate = () => {
    // Generate date between today and 3 days ago
    const now = new Date();
    const pastDays = Math.floor(Math.random() * 4); // 0, 1, 2, or 3 days ago

    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() - pastDays);

    const dayOfWeek = targetDate.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday

    // If it's Sunday, move to Saturday
    if (dayOfWeek === 0) {
        targetDate.setDate(targetDate.getDate() - 1);
    }

    const newDayOfWeek = targetDate.getDay();
    let startHour = 9;
    let endHour = newDayOfWeek === 6 ? 17 : 19; // Saturay 9-18 means max start time 17:00, Mon-Fri 9-20 means max start 19:00

    const randomHour = Math.floor(Math.random() * (endHour - startHour + 1)) + startHour;
    const randomMinutes = Math.random() > 0.5 ? 30 : 0;

    targetDate.setHours(randomHour, randomMinutes, 0, 0);
    return targetDate.toISOString();
};

const seedAppointments = async () => {
    try {
        console.log('Fetching active services...');
        // We fetch real services to ensure they match real options
        const servicesRes = await pool.query('SELECT title FROM services WHERE active = true');
        const serviceTitles = servicesRes.rows.map(r => r.title);

        if (serviceTitles.length === 0) {
            console.log("No services found in DB. Fallback to default services.");
            serviceTitles.push("Limpieza Facial", "Lifting de Pestañas", "Depilación Láser");
        }

        const mockClients = [
            { name: "Lucía Fernández", phone: "1155556666" },
            { name: "Camila Rodríguez", phone: "1144447777" },
            { name: "Martina González", phone: "1133338888" },
            { name: "Valentina Gómez", phone: "1122229999" },
            { name: "Sofía Pérez", phone: "1111110000" },
            { name: "Julieta López", phone: "1199991111" },
            { name: "Milagros Martínez", phone: "1188882222" },
            { name: "Catalina Sánchez", phone: "1177773333" }
        ];

        console.log('Seeding 8 mock clients with past appointments...');

        for (const client of mockClients) {
            const randomService = serviceTitles[Math.floor(Math.random() * serviceTitles.length)];

            const mockChatHistory = [
                { role: "assistant", content: "¡Hola! Soy Nova, tu asistente virtual. ¿Qué servicio te gustaría agendar?" },
                { role: "user", content: `Hola, quiero turnito para ${randomService}` },
                { role: "assistant", content: `¡Genial! Para proceder con ${randomService}, ¿me decís tu nombre completo?` },
                { role: "user", content: `Soy ${client.name}` },
                { role: "assistant", content: `Un gusto ${client.name}. Necesito tu WhatsApp para enviarte recordatorios.` },
                { role: "user", content: `Es ${client.phone}` }
            ];

            let leadRes = await pool.query(`SELECT id FROM leads WHERE contact_info->>'phone' = $1`, [client.phone]);
            let leadId;

            if (leadRes.rows.length > 0) {
                leadId = leadRes.rows[0].id;
                await pool.query(
                    `UPDATE leads SET client_name = $1, status = 'qualified', intent_score = 100, chat_history = $2 WHERE id = $3`,
                    [client.name, JSON.stringify(mockChatHistory), leadId]
                );
            } else {
                leadRes = await pool.query(
                    `INSERT INTO leads (client_name, contact_info, status, intent_score, chat_history) 
                 VALUES ($1, $2, 'qualified', 100, $3) RETURNING id`,
                    [client.name, JSON.stringify({ phone: client.phone }), JSON.stringify(mockChatHistory)]
                );
                leadId = leadRes.rows[0].id;
            }
            const pastDate = generateRandomPastDate();

            // Ensure appointment exists
            await pool.query(
                `INSERT INTO appointments (lead_id, service_type, date_time, status)
             VALUES ($1, $2, $3, 'confirmed')`,
                [leadId, randomService, pastDate]
            );
            console.log(`Created appointment for ${client.name} for ${randomService} at ${pastDate}`);
        }

        console.log('Seeding complete.');
    } catch (error) {
        console.error('Error seeding data:', error);
    } finally {
        await pool.end();
    }
};

seedAppointments();
