import 'dotenv/config';
import { db, getActiveServices, getCategories } from '../api/_services/db.js';
import { matchServicesGreedily } from '../api/_chat/utils.js';

async function testMatching() {
    try {
        const [services, categories] = await Promise.all([
            getActiveServices(),
            getCategories()
        ]);
        
        const testInputs = [
            "perfilado y laminado",
            "laminado de cejas y cavado completo",
            "lifting de pestañas y perfilado de cejas",
            "bozo y axilas",
            "cavado completo y tiro",
            "limpieza express",
            "kapping gel y semi"
        ];
        
        console.log("--- TESTING FUZZY MATCHING ---");
        for (const input of testInputs) {
            const matched = matchServicesGreedily(input, services, categories);
            console.log(`\nInput: "${input}"`);
            console.log(`Matches found: ${matched.length}`);
            matched.forEach(m => {
                console.log(`  - "${m.title}" ($${m.price})`);
            });
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

testMatching();
