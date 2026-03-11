import fs from 'fs';
import path from 'path';

const assetsDir = './src/assets';
const files = [
    'service-facial.jpg',
    'service-hialuronico.jpg',
    'service-botox.jpg',
    'service-peeling.jpg',
    'service-microblading.jpg',
    'service-masaje.jpg'
];

const base64Data = {};

files.forEach(file => {
    const filePath = path.join(assetsDir, file);
    if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(file).slice(1);
        base64Data[file] = `data:image/${ext};base64,${buffer.toString('base64')}`;
    }
});

const services = [
    { title: "Limpieza Facial Profunda", price: 45, duration: "60 min", description: "Extracción, exfoliación enzimática y mascarilla revitalizante.", imageKey: 'service-facial.jpg' },
    { title: "Ácido Hialurónico", price: 280, duration: "45 min", description: "Relleno dérmico premium para labios, pómulos y surcos.", imageKey: 'service-hialuronico.jpg' },
    { title: "Botox Preventivo", price: 220, duration: "30 min", description: "Toxina botulínica para líneas de expresión y frente.", imageKey: 'service-botox.jpg' },
    { title: "Peeling Químico", price: 95, duration: "45 min", description: "Renovación celular con ácidos glicólico y mandélico.", imageKey: 'service-peeling.jpg' },
    { title: "Microblading Cejas", price: 180, duration: "90 min", description: "Diseño hiperrealista pelo a pelo con pigmentos premium.", imageKey: 'service-microblading.jpg' },
    { title: "Masaje Relajante", price: 55, duration: "60 min", description: "Masaje descontracturante con aromaterapia y piedras calientes.", imageKey: 'service-masaje.jpg' }
];

let seedCode = `import { getDb } from './utils/db.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const db = getDb();
    
    const services = [
`;

services.forEach(s => {
    seedCode += `        { title: "${s.title}", price: "${s.price}", duration: "${s.duration}", description: "${s.description.replace(/"/g, '\\"')}", image_url: "${base64Data[s.imageKey] || ''}" },\n`;
});

seedCode += `    ];

    try {
        await db.query("DELETE FROM services");
        for (const s of services) {
            await db.query(
                "INSERT INTO services (title, price, duration, description, image_url, active) VALUES ($1, $2, $3, $4, $5, true)",
                [s.title, s.price, s.duration, s.description, s.image_url]
            );
        }
        return res.status(200).json({ success: true, message: "Seed complete with Base64 images" });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
}
`;

fs.writeFileSync('./api/seed.ts', seedCode);
console.log("Updated api/seed.ts with Base64 images.");
