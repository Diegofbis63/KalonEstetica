import pg from 'pg';
import { readFileSync } from 'fs';
import { parse } from 'dotenv';

// Read .env.local
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
    console.log('--- Migrando Base de Datos KÂLON a Estructura Jerárquica ---');

    // 1. Crear tabla de categorías
    console.log('Creando tabla de categorías...');
    await client.query(`
        CREATE TABLE IF NOT EXISTS categories (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(255) NOT NULL UNIQUE,
            description TEXT,
            image_url TEXT,
            sort_order INTEGER DEFAULT 0,
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. Modificar tabla de servicios para usar category_id
    console.log('Ajustando tabla de servicios...');
    await client.query(`
        -- Añadir category_id si no existe
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='category_id') THEN
                ALTER TABLE services ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE CASCADE;
            END IF;
        END $$;
    `);

    // 3. Migrar datos existentes
    console.log('Migrando datos de categorías planas a tabla relacional...');
    
    // Obtener categorías únicas de la tabla actual de servicios
    const servicesRes = await client.query('SELECT DISTINCT category FROM services WHERE category IS NOT NULL');
    const categories = servicesRes.rows;

    for (const cat of categories) {
        const catName = cat.category;
        
        // Insertar en la nueva tabla (si no existe por nombre)
        const insertRes = await client.query(`
            INSERT INTO categories (name, sort_order)
            VALUES ($1, 0)
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
        `, [catName]);
        
        const categoryId = insertRes.rows[0].id;

        // Actualizar servicios para que apunten a este ID
        await client.query(`
            UPDATE services 
            SET category_id = $1 
            WHERE category = $2
        `, [categoryId, catName]);
        
        console.log(`✅ Categoría migrada: ${catName}`);
    }

    // 4. Actualizar metadatos de categorías (opcional pero recomendado)
    const categoryMetadata = {
        "Masajes": { 
            image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=1200", 
            desc: "Terapia manual profunda para liberar tensiones corporales.",
            order: 1 
        },
        "Cejas": { 
            image: "https://images.unsplash.com/photo-1596704017254-9b121068fb31?q=80&w=1200", 
            desc: "Diseño y perfilado personalizado para realzar tu mirada.",
            order: 2 
        },
        "Depilacion": { 
            image: "https://images.unsplash.com/photo-1559599101-f09722fb4948?q=80&w=1200", 
            desc: "Tecnología láser de última generación para una piel suave.",
            order: 3 
        },
        "Pestañas": { 
            image: "https://images.unsplash.com/photo-1582213726892-2aa05a3fc551?q=80&w=1200", 
            desc: "Curvatura y volumen para resaltar tu belleza natural.",
            order: 4 
        },
        "Corporal": { 
            image: "https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200", 
            desc: "Tratamientos reductores y reafirmantes con tecnología Venus.",
            order: 5 
        },
        "Facial": { 
            image: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200", 
            desc: "Limpieza profunda y renovación celular para el rostro.",
            order: 6 
        },
        "Uñas": { 
            image: "https://images.unsplash.com/photo-1604654894611-6973b376cbde?q=80&w=1200", 
            desc: "Arte y cuidado premium para tus manos y pies.",
            order: 7 
        }
    };

    for (const [name, meta] of Object.entries(categoryMetadata)) {
        await client.query(`
            UPDATE categories 
            SET image_url = $1, description = $2, sort_order = $3
            WHERE name = $4
        `, [meta.image, meta.desc, meta.order, name]);
    }

    console.log('✅ Migración de base de datos finalizada.');
    await client.end();
}

main().catch(error => {
    console.error('❌ Error en la migración:', error);
    process.exit(1);
});
