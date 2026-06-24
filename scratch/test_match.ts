import { getActiveServices, getCategories } from '../api/_services/db.ts';
import { matchServicesGreedily, cleanString } from '../api/_chat/utils.ts';

async function run() {
    const services = await getActiveServices();
    const categories = await getCategories();
    
    const text = "laminado de cejas y pack 1 zona femenina";
    console.log("Input text:", text);
    
    const matched = matchServicesGreedily(text, services, categories);
    console.log("Matched services:");
    matched.forEach(m => console.log(`- ${m.id} [${m.title}] Price: ${m.price}`));

    // Let's trace detail for "pack 1 zona femenina"
    const part = "pack 1 zona femenina";
    console.log(`\nDetail tracing for part: "${part}"`);
    const partWords = cleanString(part).split(' ').filter(w => w.length >= 3 && w !== 'con' && w !== 'sin' && w !== 'para');
    console.log("Part words:", partWords);

    for (const svc of services) {
        if (!svc.title.toLowerCase().includes('pack')) continue;
        
        const svcTitleClean = cleanString(svc.title);
        const svcWords = svcTitleClean.split(' ').filter(w => w.length >= 3 && w !== 'con' && w !== 'sin' && w !== 'para');
        
        let score = 0;
        let matchType = "";

        if (svcTitleClean === part) {
            score = 100;
            matchType = "exact";
        } else if (part.includes(svcTitleClean) && svcTitleClean.length > 3) {
            score = 90;
            matchType = "contains";
        } else if (svcTitleClean.includes(part) && part.length > 3) {
            score = 80 + (part.length / svcTitleClean.length) * 9;
            matchType = "contained in";
        } else {
            const commonWords = partWords.filter(w => svcWords.some(sw => sw === w || sw.startsWith(w) || w.startsWith(sw)));
            if (commonWords.length > 0) {
                score = 50 + (commonWords.length / Math.max(partWords.length, svcWords.length)) * 30;
                matchType = `common words (${commonWords.join(', ')})`;
            }
        }
        
        console.log(`- Service: [${svc.title}] Score: ${score.toFixed(2)} (Type: ${matchType})`);
    }

    process.exit(0);
}

run().catch(console.error);
