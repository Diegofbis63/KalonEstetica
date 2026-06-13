export function cleanString(str: string): string {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // removes accents/diacritics
        .replace(/bozo/g, "bozo")       // keep bozo unchanged
        .replace(/ñ/g, "n")             // ñ -> n
        .replace(/[^a-z0-9\s]/g, "")    // strips punctuation
        .trim();
}

export function getCoreServiceTerms(title: string, categories: any[]): string[] {
    let cleaned = cleanString(title);
    for (const cat of categories) {
        const catName = cleanString(cat.name);
        const catSlug = cat.slug ? cleanString(cat.slug) : '';
        if (catName) {
            cleaned = cleaned.replace(new RegExp(`\\b${catName}\\b`, 'g'), '');
        }
        if (catSlug) {
            cleaned = cleaned.replace(new RegExp(`\\b${catSlug}\\b`, 'g'), '');
        }
    }
    cleaned = cleaned.replace(/\b(de|con|en|para|y|o|un|una|el|la|los|las|del|al)\b/g, '').replace(/\s+/g, ' ').trim();
    return cleaned.split(' ').filter(word => word.length >= 3);
}

export function detectCategories(text: string, categories: any[], services: any[], classification?: any): any[] {
    const cleanedText = cleanString(text);
    const textWords = cleanedText.split(' ').filter(w => w.length >= 3);
    const detected: any[] = [];
    const detectedIds = new Set<string>();

    // 1. Direct match on category names/slugs
    for (const cat of categories) {
        const cleanedName = cleanString(cat.name);
        const cleanedSlug = cat.slug ? cleanString(cat.slug) : '';
        
        if (
            (cleanedName && cleanedText.includes(cleanedName)) || 
            (cleanedSlug && cleanedText.includes(cleanedSlug))
        ) {
            if (!detectedIds.has(cat.id)) {
                detected.push(cat);
                detectedIds.add(cat.id);
            }
        }
    }

    // 2. Service-to-category matching using core terms (sharing at least one significant word)
    for (const svc of services) {
        const coreTerms = getCoreServiceTerms(svc.title, categories);
        for (const term of coreTerms) {
            if (term && term.length >= 3 && textWords.some(w => w === term || w.includes(term) || term.includes(w))) {
                const parentCat = categories.find(c => c.id === svc.category_id);
                if (parentCat && !detectedIds.has(parentCat.id)) {
                    detected.push(parentCat);
                    detectedIds.add(parentCat.id);
                }
            }
        }
    }

    // 3. Fallback to AI classification detected categories
    if (classification?.detected_categories) {
        for (const dc of classification.detected_categories) {
            const cleanedDc = cleanString(dc);
            for (const cat of categories) {
                const cleanedName = cleanString(cat.name);
                if (cleanedDc.includes(cleanedName) || cleanedName.includes(cleanedDc)) {
                    if (!detectedIds.has(cat.id)) {
                        detected.push(cat);
                        detectedIds.add(cat.id);
                    }
                }
            }
        }
    }

    return detected;
}

export function matchServicesGreedily(text: string, services: any[], categories: any[]): any[] {
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
