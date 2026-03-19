
// @ts-nocheck
import { db } from '../api/_services/db.js';
import * as schema from '../api/_services/schema.js';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function main() {
    console.log('--- DB HARD RESET STARTED ---');

    // 1. Clear existing
    console.log('Cleaning existing services and categories...');
    try {
        await db.delete(schema.services);
        console.log('Services cleared.');
        await db.delete(schema.categories);
        console.log('Categories cleared.');
    } catch (err) {
        console.error('Error during cleanup:', err);
    }

    // 2. Define Category mapping
    const categoryDefinitions = [
        { name: 'Depilación', slug: 'depilacion', description: 'Tratamientos de depilación tradicional y definitiva.', image_url: 'https://images.unsplash.com/photo-1596704017254-9b121068fb31?q=80&w=800' },
        { name: 'Facial', slug: 'facial', description: 'Cosmetología y estética facial avanzada.', image_url: 'https://images.unsplash.com/photo-1512290923902-8a9f81dc2069?q=80&w=800' },
        { name: 'Manicuria', slug: 'manicuria', description: 'Belleza de manos y pies.', image_url: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?q=80&w=800' },
        { name: 'Masajes', slug: 'masajes', description: 'Terapias corporales y relajantes.', image_url: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=800' },
        { name: 'Psicología', slug: 'psicologia', description: 'Sesiones de Terapia Cognitivo Conductual.', image_url: 'https://images.unsplash.com/photo-1527137342181-19aab11a8ee1?q=80&w=800' },
        { name: 'Pestañas', slug: 'pestanas', description: 'Lifting y extensiones de pestañas.', image_url: 'https://images.unsplash.com/photo-1583001838473-b19959f7be5a?q=80&w=800' },
        { name: 'Reiki', slug: 'reiki', description: 'Terapia de sanación y equilibrio energético.', image_url: 'https://images.unsplash.com/photo-1552693673-1bf958298935?q=80&w=800' },
        { name: 'Podología', slug: 'podologia', description: 'Cuidado clínico y estético de los pies.', image_url: 'https://images.unsplash.com/photo-1519415510236-8a5ad7afbb5a?q=80&w=800' }
    ];

    const slugToId = {};

    console.log('Inserting 8 official categories...');
    for (const catDef of categoryDefinitions) {
        const result = await db.insert(schema.categories).values({
            name: catDef.name,
            slug: catDef.slug,
            description: catDef.description,
            image_url: catDef.image_url,
            active: true,
            sort_order: 0
        }).returning();
        slugToId[catDef.slug] = result[0].id;
        console.log(`Created category: ${catDef.name} (${result[0].id})`);
    }

    // 3. Load JSON and Insert Services
    const jsonPath = path.join(process.cwd(), 'data', 'initial_services.json');
    const rawData = fs.readFileSync(jsonPath, 'utf8');
    const jsonData = JSON.parse(rawData);
    const servicesData = jsonData.services_structure;

    const mapping = {
        "Depilación Femenina Tradicional": "depilacion",
        "Depilación Masculina Tradicional": "depilacion",
        "Depilación Definitiva SOPRANO (Packs)": "depilacion",
        "Tratamientos Faciales": "facial",
        "Manicuria y Pedicuria": "manicuria",
        "Masajes y Terapias": "masajes",
        "Psicología": "psicologia",
        "Pestañas, Reiki y Podología": "special"
    };

    console.log('Seeding services...');
    for (const [groupName, services] of Object.entries(servicesData)) {
        let catId;
        const slug = mapping[groupName];
        
        if (slug === 'special') {
            // Logic for Pestañas, Reiki and Podología
            for (const svc of services) {
                let targetSlug;
                if (svc.name.includes('Pestañas')) targetSlug = 'pestanas';
                else if (svc.name.includes('Reiki')) targetSlug = 'reiki';
                else if (svc.name.includes('Podología')) targetSlug = 'podologia';
                
                if (targetSlug) {
                    await db.insert(schema.services).values({
                        category_id: slugToId[targetSlug],
                        title: svc.name,
                        description: `Tratamiento exclusivo de ${targetSlug}.`,
                        price: svc.price.toString(),
                        duration: `${svc.duration_min} min`,
                        duration_min: svc.duration_min,
                        active: true
                    });
                }
            }
            continue;
        }

        catId = slugToId[slug];
        if (!catId) {
            console.warn(`No ID found for slug ${slug} (Group: ${groupName})`);
            continue;
        }

        for (const svc of services) {
            await db.insert(schema.services).values({
                category_id: catId,
                title: svc.name,
                description: `Tratamiento de ${groupName}.`,
                price: svc.price.toString(),
                duration: `${svc.duration_min} min`,
                duration_min: svc.duration_min,
                active: true
            });
        }
    }

    console.log('--- DB HARD RESET COMPLETED SUCCESSFULLY ---');
    process.exit(0);
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
