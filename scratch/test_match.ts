import { cleanString } from '../api/_chat/utils.ts';

export function matchServicesGreedilyProposed(text: string, services: any[], categories: any[]): any[] {
    // Split the input into parts by typical separators (y, o, comas, +, etc) BEFORE cleaning to preserve them.
    // We use \b for word boundaries on literal Spanish conjunctions (y, o, u) so we don't split inside words like "hoy".
    // Comma (,) and plus (+) are non-word characters, so they don't use word boundaries.
    const parts = text.split(/\b(?:y|o|u)\b|,|\+/i).map(p => cleanString(p).trim()).filter(Boolean);
    
    const matched: any[] = [];
    const matchedIds = new Set<string>();

    // Sort services by title length descending to match longer titles (combos/promos) first
    const sortedServices = [...services].sort((a, b) => b.title.length - a.title.length);

    for (const part of parts) {
        const partWords = part.split(' ').filter(w => w.length >= 3 && w !== 'con' && w !== 'sin' && w !== 'para');
        if (partWords.length === 0) {
            // Special handling for short 2-character words like "bozo" or "tiro"
            const shortWords = part.split(' ').filter(w => w === 'bozo' || w === 'tiro' || w === 'cejas' || w === 'pies');
            if (shortWords.length === 0) continue;
            partWords.push(...shortWords);
        }

        let bestMatch: any = null;
        let bestScore = 0;

        for (const svc of sortedServices) {
            if (matchedIds.has(svc.id)) continue;

            const svcTitleClean = cleanString(svc.title);
            const svcWords = svcTitleClean.split(' ').filter(w => w.length >= 3 && w !== 'con' && w !== 'sin' && w !== 'para');

            // Include short key words in comparison
            const svcShortWords = svcTitleClean.split(' ').filter(w => w === 'bozo' || w === 'tiro' || w === 'cejas' || w === 'pies');
            if (svcWords.length === 0) svcWords.push(...svcShortWords);

            // 1. Exact match score
            if (svcTitleClean === part) {
                bestMatch = svc;
                bestScore = 100;
                break; // Perfect match
            }

            // 2. Part contains full service title
            if (part.includes(svcTitleClean) && svcTitleClean.length > 3) {
                if (90 > bestScore) {
                    bestMatch = svc;
                    bestScore = 90;
                }
                continue;
            }

            // 3. Service title contains the part
            if (svcTitleClean.includes(part) && part.length > 3) {
                const score = 80 + (part.length / svcTitleClean.length) * 9;
                if (score > bestScore) {
                    bestMatch = svc;
                    bestScore = score;
                }
            }

            // 4. Word-based fuzzy match score
            const commonWords = partWords.filter(w => svcWords.some(sw => sw === w || sw.startsWith(w) || w.startsWith(sw)));
            if (commonWords.length > 0) {
                const score = 50 + (commonWords.length / Math.max(partWords.length, svcWords.length)) * 30;
                if (score > bestScore) {
                    bestMatch = svc;
                    bestScore = score;
                }
            }
        }

        // Only accept reasonably good matches
        if (bestMatch && bestScore >= 55) {
            matched.push(bestMatch);
            matchedIds.add(bestMatch.id);
        }
    }

    // Fallback: If no matches were found using split parts, try matching against the whole cleanedText
    if (matched.length === 0) {
        const cleanedText = cleanString(text);
        for (const svc of sortedServices) {
            const svcTitleClean = cleanString(svc.title);
            if (svcTitleClean && cleanedText.includes(svcTitleClean)) {
                if (!matchedIds.has(svc.id)) {
                    matched.push(svc);
                    matchedIds.add(svc.id);
                }
            }
        }
        
        // Final fallback: Core terms check on whole text
        if (matched.length === 0) {
            const cleanedText = cleanString(text);
            const textWords = cleanedText.split(' ').filter(w => w.length >= 3);
            for (const svc of sortedServices) {
                const svcWords = cleanString(svc.title).split(' ').filter(w => w.length >= 3 && w !== 'con' && w !== 'sin' && w !== 'para');
                const common = textWords.filter(w => svcWords.some(sw => sw === w || sw.startsWith(w) || w.startsWith(sw)));
                if (common.length >= 2 || (common.length >= 1 && svcWords.length === 1)) {
                    if (!matchedIds.has(svc.id)) {
                        matched.push(svc);
                        matchedIds.add(svc.id);
                    }
                }
            }
        }
    }

    return matched;
}

const mockServices = [
  { id: "1", title: "Lifting de pestañas", price: 18000 },
  { id: "2", title: "Axilas", price: 3500 }
];
const mockCategories = [];

const testCases = [
  "lifting de pestañas y axilas",
  "lifting de pestañas, axilas",
  "lifting de pestañas + axilas",
  "axilas y lifting de pestañas"
];

testCases.forEach(tc => {
  console.log(`\nTest Case: "${tc}"`);
  console.log("Matched:", matchServicesGreedilyProposed(tc, mockServices, mockCategories));
});
