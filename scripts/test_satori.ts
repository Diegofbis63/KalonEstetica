import { generateMenuImage } from '../api/_services/imageGenerator.js';
import fs from 'fs';
import path from 'path';

async function test() {
    console.log("Starting Satori Diagnostic...");
    const items = [
        { label: "Depilación Láser", price: 5500 },
        { label: "Masajes Relajantes", price: 4200 },
        { label: "Limpieza Facial", price: 3800 }
    ];
    
    try {
        const buf = await generateMenuImage("DIAGNÓSTICO KÂLON", items, 0);
        if (buf) {
            const outputPath = path.join(process.cwd(), 'tmp', 'satori_diag.png');
            if (!fs.existsSync(path.dirname(outputPath))) fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(outputPath, Buffer.from(buf));
            console.log(`Success! Image saved to: ${outputPath} (${buf.byteLength} bytes)`);
        } else {
            console.error("Fail: generateMenuImage returned null");
        }
    } catch (e) {
        console.error("Critical Error during Satori rendering:", e);
    }
}

test();
