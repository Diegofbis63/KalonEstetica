import pg from 'pg';
import { readFileSync } from 'fs';
import { parse } from 'dotenv';

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
    console.log('--- Sembrando Catálogo Detallado KÂLON ---');

    await client.query('DELETE FROM services');

    const detailedServices = [
        // MASAJES
        { categoria: 'Masajes', titulo: 'Masaje Descontracturante Profundo', desc: 'Ideal para aliviar tensiones crónicas y nudos musculares.', precio: 68000, duracion: '60 min', img: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=800' },
        { categoria: 'Masajes', titulo: 'Masaje con Piedras Calientes', desc: 'Terapia relajante que utiliza piedras volcánicas para armonizar la energía.', precio: 75000, duracion: '90 min', img: 'https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?q=80&w=800' },
        { categoria: 'Masajes', titulo: 'Drenaje Linfático Manual', desc: 'Técnica suave para eliminar toxinas y mejorar la circulación.', precio: 55000, duracion: '50 min', img: 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?q=80&w=800' },
        
        // CEJAS
        { categoria: 'Cejas', titulo: 'Perfilado de Cejas con Henna', desc: 'Diseño personalizado y sombreado natural de larga duración.', precio: 18000, duracion: '45 min', img: 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?q=80&w=800' },
        { categoria: 'Cejas', titulo: 'Microblading 6D Pelo a Pelo', desc: 'Técnica de micropigmentación para reconstruir cejas ralas o inexistentes.', precio: 150000, duracion: '180 min', img: 'https://images.unsplash.com/photo-1598452963314-b09f397a5c48?q=80&w=800' },
        { categoria: 'Cejas', titulo: 'Laminado de Cejas (Brow Lamination)', desc: 'Peinado y fijación para unas cejas más pobladas y definidas.', precio: 32000, duracion: '60 min', img: 'https://images.unsplash.com/photo-1596704017254-9b121068fb31?q=80&w=800' },

        // DEPILACION
        { categoria: 'Depilacion', titulo: 'Soprano Ice Platinum - Flex Box', desc: 'Depilación láser definitiva indolora para todas las áreas.', precio: 45000, duracion: '40 min', img: 'https://images.unsplash.com/photo-1559599101-f09722fb4948?q=80&w=800' },
        { categoria: 'Depilacion', titulo: 'Depilación con Cera Descartable Premium', desc: 'Sistema tradicional con cera de aloe vera para pieles sensibles.', precio: 12000, duracion: '30 min', img: 'https://images.unsplash.com/photo-1590439471364-192aa70c0b53?q=80&w=800' },

        // PESTAÑAS
        { categoria: 'Pestañas', titulo: 'Lifting de Pestañas + Keratina', desc: 'Curvatura natural potenciada con nutrición profunda.', precio: 28000, duracion: '60 min', img: 'https://images.unsplash.com/photo-1582213726892-2aa05a3fc551?q=80&w=800' },
        { categoria: 'Pestañas', titulo: 'Extensiones de Pestañas Volumen Ruso', desc: 'Efecto de máxima densidad y volumen para una mirada impactante.', precio: 55000, duracion: '120 min', img: 'https://images.unsplash.com/photo-1502767089025-6572583495f9?q=80&w=800' },
        { categoria: 'Pestañas', titulo: 'Extensiones Clásicas 1x1', desc: 'Longitud y curvatura natural pestaña por pestaña.', precio: 42000, duracion: '90 min', img: 'https://images.unsplash.com/photo-1448376561459-dbe8868fa34c?q=80&w=800' },

        // CORPORAL
        { categoria: 'Corporal', titulo: 'Criolipólisis Plana Reductora', desc: 'Eliminación selectiva de grasa localizada mediante frío.', precio: 95000, duracion: '45 min', img: 'https://images.unsplash.com/photo-1512290923902-8a9f81dc2069?q=80&w=800' },
        { categoria: 'Corporal', titulo: 'Radiofrecuencia Corporal Venus Legacy', desc: 'Tensado de la piel y reducción de celulitis de alta eficacia.', precio: 88000, duracion: '60 min', img: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=800' },
        { categoria: 'Corporal', titulo: 'Exfoliación e Hidratación Profunda Body Silk', desc: 'Ritual de suavidad total con sales del mar muerto.', precio: 35000, duracion: '60 min', img: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=800' },

        // FACIAL
        { categoria: 'Facial', titulo: 'Limpieza Facial Profunda con Ultrasonido', desc: 'Remoción de impurezas y puntos negros sin irritación.', precio: 48000, duracion: '75 min', img: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=800' },
        { categoria: 'Facial', titulo: 'Peeling Químico de Verano', desc: 'Renovación cutánea suave apta para todo el año.', precio: 38000, duracion: '45 min', img: 'https://images.unsplash.com/photo-1512290923902-8a9f81dc2069?q=80&w=800' },
        { categoria: 'Facial', titulo: 'Dermapen con Ácido Hialurónico', desc: 'Inducción de colágeno para una piel más joven y luminosa.', precio: 62000, duracion: '60 min', img: 'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?q=80&w=800' },

        // UÑAS
        { categoria: 'Uñas', titulo: 'Manicura Rusa con Esmaltado Semi', desc: 'Técnica de precisión para un acabado impecable y duradero.', precio: 32000, duracion: '90 min', img: 'https://images.unsplash.com/photo-1604654894611-6973b376cbde?q=80&w=800' },
        { categoria: 'Uñas', titulo: 'Esculpidas en Polygel Premium', desc: 'Extensiones resistentes y ligeras con acabado natural.', precio: 58000, duracion: '150 min', img: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?q=80&w=800' },
        { categoria: 'Uñas', titulo: 'Kapping Gel + Nail Art Mano Alzada', desc: 'Protección para uña natural con diseños artísticos exclusivos.', precio: 40000, duracion: '120 min', img: 'https://images.unsplash.com/photo-1607779097040-26e80aa78e66?q=80&w=800' },
    ];

    for (let i = 0; i < detailedServices.length; i++) {
        const s = detailedServices[i];
        await client.query(
            'INSERT INTO services (category, title, description, price, duration, image_url, sort_order, active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [s.categoria, s.titulo, s.desc, s.precio, s.duracion, s.img, i + 1, true]
        );
        console.log(`✅ [${s.categoria}] Sub-servicio creado: ${s.titulo}`);
    }

    console.log('--- Sembrado finalizado con éxito ---');
    await client.end();
}

main().catch(console.error);
