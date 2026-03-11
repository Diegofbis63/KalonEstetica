import { Pool } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

async function seed() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    const services = [
        { title: "Limpieza Facial Profunda", price: 45, duration: "60 min", description: "Extracción, exfoliación enzimática y mascarilla revitalizante." },
        { title: "Ácido Hialurónico", price: 280, duration: "45 min", description: "Relleno dérmico premium para labios, pómulos y surcos." },
        { title: "Botox Preventivo", price: 220, duration: "30 min", description: "Toxina botulínica para líneas de expresión y frente." },
        { title: "Peeling Químico", price: 95, duration: "45 min", description: "Renovación celular con ácidos glicólico y mandélico." },
        { title: "Microblading Cejas", price: 180, duration: "90 min", description: "Diseño hiperrealista pelo a pelo con pigmentos premium." },
        { title: "Masaje Relajante", price: 55, duration: "60 min", description: "Masaje descontracturante con aromaterapia y piedras calientes." }
    ];

    console.log("Seeding services...");
    for (const s of services) {
        await pool.query(
            "INSERT INTO services (title, price, duration, description, active) VALUES ($1, $2, $3, $4, true) ON CONFLICT DO NOTHING",
            [s.title, s.price, s.duration, s.description]
        );
    }

    console.log("Seed complete!");
    await pool.end();
}

seed().catch(console.error);
