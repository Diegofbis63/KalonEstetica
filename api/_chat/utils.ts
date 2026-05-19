export function cleanString(str: string): string {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // removes accents/diacritics
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
    cleaned = cleaned.replace(/\b(de|con|en|para|y)\b/g, '').replace(/\s+/g, ' ').trim();
    return [cleaned].filter(Boolean);
}

export function detectCategories(text: string, categories: any[], services: any[], classification?: any): any[] {
    const cleanedText = cleanString(text);
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

    // 2. Service-to-category matching using core terms
    for (const svc of services) {
        const coreTerms = getCoreServiceTerms(svc.title, categories);
        for (const term of coreTerms) {
            if (term && cleanedText.includes(term)) {
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
    const cleanedText = cleanString(text);
    let remainingText = cleanedText;
    const matched: any[] = [];
    const matchedIds = new Set<string>();

    const sortedServices = [...services].sort((a, b) => b.title.length - a.title.length);

    // Phase 1: Try exact cleaned title match
    for (const svc of sortedServices) {
        const cleanedTitle = cleanString(svc.title);
        if (cleanedTitle && remainingText.includes(cleanedTitle)) {
            if (!matchedIds.has(svc.id)) {
                matched.push(svc);
                matchedIds.add(svc.id);
                remainingText = remainingText.replace(cleanedTitle, "").trim();
            }
        }
    }

    // Phase 2: Try core terms matching
    for (const svc of sortedServices) {
        if (matchedIds.has(svc.id)) continue;
        const coreTerms = getCoreServiceTerms(svc.title, categories);
        for (const term of coreTerms) {
            if (term && remainingText.includes(term)) {
                if (!matchedIds.has(svc.id)) {
                    matched.push(svc);
                    matchedIds.add(svc.id);
                    remainingText = remainingText.replace(term, "").trim();
                }
            }
        }
    }

    return matched;
}
