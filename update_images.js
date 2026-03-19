
import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const db_url = process.env.DATABASE_URL;
const sql = neon(db_url);

const stockImages = {
    'Facial': 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200',
    'Corporal': 'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?q=80&w=1200',
    'Masajes': 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=1200',
    'Depilación': 'https://images.unsplash.com/photo-1590439471364-192aa70c0b53?q=80&w=1200',
    'Cejas y Pestañas': 'https://images.unsplash.com/photo-1596704017254-9b121068fb31?q=80&w=1200',
    'Manicuria': 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?q=80&w=1200',
    'Estética de Avanzada': 'https://images.unsplash.com/photo-1512290923902-8a9f81dc206e?q=80&w=1200',
    'Nutrición y Bienestar': 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=1200'
};

async function run() {
    try {
        console.log("Updating category images...");
        for (const [name, url] of Object.entries(stockImages)) {
            await sql`UPDATE categories SET image_url = ${url} WHERE name ILIKE ${'%' + name + '%'}`;
        }
        console.log("Images updated!");
    } catch (err) {
        console.error(err);
    }
}

run();
