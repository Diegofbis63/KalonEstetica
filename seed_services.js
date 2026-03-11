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
    console.log('--- Limpiando e Insertando Servicios KÂLON ---');

    // Limpiar servicios existentes para evitar duplicados en esta carga inicial
    await client.query('DELETE FROM services');

    const services = [
        {
            title: 'Masajes Relajantes',
            description: 'Terapia manual profunda para liberar tensiones musculares y reducir el estrés. Incluye aceites esenciales orgánicos.',
            price: 65000,
            duration: '60 min',
            image_url: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&q=80&w=800',
            sort_order: 1
        },
        {
            title: 'Diseño de Cejas',
            description: 'Perfilado personalizado según la morfología del rostro. Incluye depilación, diseño y sombreado con henna opcional.',
            price: 15000,
            duration: '30 min',
            image_url: 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&q=80&w=800',
            sort_order: 2
        },
        {
            title: 'Depilación Definitiva',
            description: 'Sistema de última tecnología para la eliminación permanente del vello. Seguro para todos los tipos de piel.',
            price: 45000,
            duration: '45 min',
            image_url: 'https://images.unsplash.com/photo-1559599101-f09722fb4948?auto=format&fit=crop&q=80&w=800',
            sort_order: 3
        },
        {
            title: 'Lifting de Pestañas',
            description: 'Curvatura natural de tus pestañas desde la raíz. Incluye tinte y tratamiento nutritivo de keratina.',
            price: 25000,
            duration: '60 min',
            image_url: 'https://images.unsplash.com/photo-1582213726892-2aa05a3fc551?auto=format&fit=crop&q=80&w=800',
            sort_order: 4
        },
        {
            title: 'Tratamiento Corporal',
            description: 'Protocolo reductor y reafirmante con aparatología avanzada. Mejora la textura de la piel y reduce adiposidad.',
            price: 85000,
            duration: '90 min',
            image_url: 'https://images.unsplash.com/photo-1512290923902-8a9f81dc2069?auto=format&fit=crop&q=80&w=800',
            sort_order: 5
        },
        {
            title: 'Limpieza Facial Profunda',
            description: 'Renovación celular completa. Incluye exfoliación, extracciones, mascarilla de alta gama y sérum hidratante.',
            price: 42000,
            duration: '60 min',
            image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&q=80&w=800',
            sort_order: 6
        },
        {
            title: 'Uñas Sculpting & Nail Art',
            description: 'Manicura premium con esmaltado semipermanente o esculpido. Diseños exclusivos y técnica de vanguardia.',
            price: 32000,
            duration: '120 min',
            image_url: 'https://images.unsplash.com/photo-1604654894611-6973b376cbde?auto=format&fit=crop&q=80&w=800',
            sort_order: 7
        }
    ];

    for (const s of services) {
        await client.query(
            'INSERT INTO services (title, description, price, duration, image_url, sort_order, active) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [s.title, s.description, s.price, s.duration, s.image_url, s.sort_order, true]
        );
        console.log(`✅ Servicio creado: ${s.title}`);
    }

    console.log('--- Carga de servicios finalizada ---');
    await client.end();
}

main().catch(console.error);
