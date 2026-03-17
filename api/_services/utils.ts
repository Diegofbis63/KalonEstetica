
export const normalizeText = (text: string) => 
    text.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "");

export function getSimilarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) costs[j] = j;
            else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1))
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return (longer.length - costs[s2.length]) / longer.length;
}

export function extractName(text: string): string {
    const prefixes = [
        "si mi nombre es", "mi nombre es", "mi nombre", "soy", "me llamo", 
        "hola soy", "hola mi nombre es", "si", "hola", "buen dia", "buenas",
        "podes anotarme como", "anotame como", "ponele que soy", "me registro como"
    ];
    let cleaned = text.trim();
    let lower = cleaned.toLowerCase();
    
    for (const p of prefixes) {
        if (lower.startsWith(p)) {
            cleaned = cleaned.substring(p.length).trim();
            lower = cleaned.toLowerCase();
        }
    }
    
    cleaned = cleaned.replace(/^[.,!?;:\s]+|[.,!?;:\s]+$/g, "");
    return cleaned.split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

export function formatDateHuman(dateStr: string): string {
    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const [y, m, d] = dateStr.split("-").map(Number);
    return `${d} ${months[m - 1]} ${y}`;
}

export function formatDurationHuman(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (hours === 1 && mins === 0) return `1 hora`;
    if (hours > 1 && mins === 0) return `${hours}hs`;
    return `${hours}:${mins.toString().padStart(2, '0')}hs`;
}

export function parseDuration(durationStr: string): number {
    if (!durationStr) return 60;
    const lower = durationStr.toLowerCase();
    
    const colonMatch = lower.match(/(\d+):(\d+)/);
    if (colonMatch) {
        return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
    }
    
    const hourMatch = lower.match(/(\d+)\s*h/);
    if (hourMatch) {
        let total = parseInt(hourMatch[1]) * 60;
        const minMatch = lower.match(/(\d+)\s*m/);
        if (minMatch && !lower.includes("min")) {
             total += parseInt(minMatch[1]);
        }
        return total;
    }

    const match = durationStr.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 60;
}

export function getLocalISODate(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' }).format(date);
}

export function parseRelativeDate(input: string, referenceDate: Date): string | null {
    const days: Record<string, number> = {
        "lunes": 1, "martes": 2, "miercoles": 3, "jueves": 4, "viernes": 5, "sabado": 6, "domingo": 0
    };
    const tokens = normalizeText(input).split(/\s+/);
    
    for (const [name, val] of Object.entries(days)) {
        if (tokens.includes(name)) {
            const result = new Date(referenceDate);
            const currentDay = result.getDay();
            let diff = val - currentDay;
            if (diff <= 0) diff += 7;
            result.setDate(result.getDate() + diff);
            return getLocalISODate(result);
        }
    }
    
    if (tokens.includes("hoy")) return getLocalISODate(referenceDate);
    if (tokens.includes("manana")) {
        const d = new Date(referenceDate);
        d.setDate(d.getDate() + 1);
        return getLocalISODate(d);
    }
    
    return null;
}

export function formatForWhatsApp(text: string): string {
    return text.replace(/\*\*(.*?)\*\*/g, '*$1*').trim();
}

/**
 * Normalización de teléfonos ultra-robusta.
 * Elimina caracteres no numéricos y remueve prefijos comunes (54, 549, 0).
 */
export function normalizePhone(phone: string): string {
    if (!phone) return "";
    // Elimina todos los caracteres no numéricos
    const numeric = phone.replace(/\D/g, '');
    
    // Remueve prefijos comunes si existen
    let result = numeric;
    if (result.startsWith('549')) result = result.substring(3);
    else if (result.startsWith('54')) result = result.substring(2);
    
    // Remueve el 0 inicial si existe (ej: 0351 -> 351)
    if (result.startsWith('0')) result = result.substring(1);
    
    return result;
}

/**
 * Comparación flexible basada en los últimos 10 dígitos.
 */
export function comparePhones(p1: string, p2: string): boolean {
    const n1 = normalizePhone(p1);
    const n2 = normalizePhone(p2);
    
    const suffix1 = n1.slice(-10);
    const suffix2 = n2.slice(-10);
    
    return suffix1 === suffix2 && suffix1.length >= 7;
}
