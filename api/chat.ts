import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

// Note: node-nlp is a CommonJS module
import pkgNlp from 'node-nlp';
const { NlpManager } = pkgNlp;

// Vercel Types
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Singleton NLP Manager ───────────────────────────────────────────────────
let manager: any = null;
async function getNlpManager() {
    if (manager) return manager;
    manager = new NlpManager({ languages: ['es'], autoSave: false, forceNER: false, nlp: { useNativeSentiment: false } });
    
    const modelPath = path.join(process.cwd(), 'Entrenamiento NLP', 'model-es.json');
    if (fs.existsSync(modelPath)) {
        const data = fs.readFileSync(modelPath, 'utf8');
        manager.import(data);
    } else {
        const corpusPath = path.join(process.cwd(), 'Entrenamiento NLP', 'corpus-es.json');
        if (fs.existsSync(corpusPath)) {
            const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
            manager.addCorpus(corpus);
            await manager.train();
        }
    }
    return manager;
}

const normalizeText = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "");

// Simple fuzzy matching helper
function getSimilarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    
    // Levenshtein
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

function extractName(text: string): string {
    const prefixes = [
        "si mi nombre es", "mi nombre es", "mi nombre", "soy", "me llamo", 
        "hola soy", "hola mi nombre es", "si", "hola", "buen dia", "buenas",
        "podes anotarme como", "anotame como", "ponele que soy", "me registro como"
    ];
    let cleaned = text.trim();
    let lower = cleaned.toLowerCase();
    
    // Check for "Si mi nombre es..." style
    for (const p of prefixes) {
        if (lower.startsWith(p)) {
            cleaned = cleaned.substring(p.length).trim();
            lower = cleaned.toLowerCase();
        }
    }
    
    // Remove punctuation at the end and start
    cleaned = cleaned.replace(/^[.,!?;:\s]+|[.,!?;:\s]+$/g, "");
    
    // Camel case name parts
    return cleaned.split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

interface ConvState {
    clientName: string | null;
    clientPhone: string | null;
    selectedServiceIds: string[];
    currentCategoryId: string | null;
    stage: 'greeting' | 'parent_selection' | 'sub_service_selection' | 'cart_review' | 'cart_confirmation' | 'name_collection' | 'phone_collection' | 'availability_proposal' | 'payment_request' | 'waiting_for_receipt' | 'done';
    pendingCategoryIds: string[];
    pendingDate: string | null;
    pendingTime: string | null;
    rejectedDates: string[];
    requestedTime: string | null;
    requestedDate: string | null;
    requestedAllOptions: boolean;
    lastIntent?: string;
    isBotEnabled?: boolean;
}

function formatDateHuman(dateStr: string): string {
    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const [y, m, d] = dateStr.split("-").map(Number);
    return `${d} ${months[m - 1]} ${y}`;
}

function formatDurationHuman(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}hs`;
    return `${hours}:${mins.toString().padStart(2, '0')}hs`;
}

function parseRelativeDate(input: string, referenceDate: Date): string | null {
    const days: Record<string, number> = {
        "lunes": 1, "martes": 2, "miercoles": 3, "jueves": 4, "viernes": 5, "sabado": 6, "domingo": 0
    };
    const tokens = normalizeText(input).split(/\s+/);
    
    // Check for day names
    for (const [name, val] of Object.entries(days)) {
        if (tokens.includes(name)) {
            const result = new Date(referenceDate);
            const currentDay = result.getDay();
            let diff = val - currentDay;
            if (diff <= 0) diff += 7; // Next occurrence
            result.setDate(result.getDate() + diff);
            return result.toISOString().split('T')[0];
        }
    }
    
    // Check for "hoy", "manana"
    if (tokens.includes("hoy")) return referenceDate.toISOString().split('T')[0];
    if (tokens.includes("manana")) {
        const d = new Date(referenceDate);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    }
    
    return null;
}

async function extractState(
    messages: Array<{ role: string; content: string }>, 
    categories: any[], 
    services: any[],
    defaultIsBotEnabled: boolean = true
): Promise<ConvState> {
    const state: ConvState = {
        clientName: null,
        clientPhone: null,
        selectedServiceIds: [],
        currentCategoryId: null,
        pendingCategoryIds: [],
        stage: 'greeting',
        pendingDate: null,
        pendingTime: null,
        requestedDate: null,
        requestedTime: null,
        rejectedDates: [],
        requestedAllOptions: false,
        isBotEnabled: defaultIsBotEnabled
    };

    const today = new Date("2026-03-14T12:00:00Z"); // Fix reference per user metadata

    if (messages.length === 0) return state;

    let currentBotAsked: string | null = null;
    const nlp = await getNlpManager();

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg.content) continue;
        const normalizedContent = normalizeText(msg.content);

        if (msg.role === 'assistant' || msg.role === 'bot') {
            const botText = normalizeText(msg.content);
            if (botText.includes("elige una categoria") || botText.includes("nuestras categorias")) currentBotAsked = 'category';
            else if (botText.includes("servicios de") || botText.includes("tratamientos de") || botText.includes("estos son los tratamientos")) currentBotAsked = 'sub_service';
            else if (botText.includes("revisemos tu pedido") || botText.includes("tu carrito") || botText.includes("listado de todos")) currentBotAsked = 'cart_review';
            else if (botText.includes("agregar algo mas") || botText.includes("avanzamos con el turno")) currentBotAsked = 'cart_confirmation';
            else if (botText.includes("tu nombre") || botText.includes("con quien tengo")) currentBotAsked = 'name';
            else if (botText.includes("whatsapp") || botText.includes("numero") || botText.includes("este numero")) currentBotAsked = 'phone';
            else if (botText.includes("proximo horario") || botText.includes("confirmar el turno") || botText.includes("disponibilidad")) {
                currentBotAsked = 'availability';
                // Detect date/time from bot's last proposal
                const dateMatch = msg.content.match(/(\d{4})-(\d{2})-(\d{2})/);
                const timeMatch = msg.content.match(/(\d{1,2}):(\d{2})/);
                if (dateMatch) state.pendingDate = dateMatch[0];
                if (timeMatch) state.pendingTime = timeMatch[0].padStart(5, '0');
            }
            else if (botText.includes("necesitamos una seña")) currentBotAsked = 'payment';
            
            services.forEach(s => {
                const normalizedTitle = normalizeText(s.title);
                if (botText.includes(normalizedTitle) && (botText.includes("agregue") || botText.includes("seleccionaste"))) {
                    if (!state.selectedServiceIds.includes(s.id)) state.selectedServiceIds.push(s.id);
                }
            });
            continue;
        }

        if (msg.role === 'user') {
            const isLastMessage = i === messages.length - 1;
            const nlpResult = await nlp.process('es', msg.content);
            const intent = nlpResult?.intent;
            if (isLastMessage) state.lastIntent = intent;

            // Global intent handling
            if (intent === 'saludo' || intent === 'pedir_turno_general' || intent === 'listar_servicios') {
                if (state.stage === 'greeting' || (isLastMessage && state.selectedServiceIds.length === 0)) {
                    state.stage = 'parent_selection';
                }
            }

            // --- Relative Date & Time Detection ---
            const relDate = parseRelativeDate(msg.content, today);
            if (relDate) state.requestedDate = relDate;
            
            const timeMatch = msg.content.match(/(\d{1,2})(:|\s?hs?|y\s)(\d{2})?/i);
            if (timeMatch) {
                let h = parseInt(timeMatch[1]);
                const m = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
                // Basic PM conversion: if user says "4" and it's scheduling context, assume 16 unless they say "mañana"
                if (h < 9) h += 12;
                state.requestedTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            }

            // --- Multi-Category Detection ---
            const catsInFoundOrder = categories
                .filter(c => normalizedContent.includes(normalizeText(c.name)))
                .map(c => ({ id: c.id, pos: normalizedContent.indexOf(normalizeText(c.name)) }))
                .sort((a, b) => a.pos - b.pos)
                .map(x => x.id);
            
            catsInFoundOrder.forEach(cid => {
                if (!state.pendingCategoryIds.includes(cid) && state.currentCategoryId !== cid) {
                    const hasSvcFromCat = state.selectedServiceIds.some(sid => services.find(s => s.id === sid)?.category_id === cid);
                    if (!hasSvcFromCat) state.pendingCategoryIds.push(cid);
                }
            });

            if (!state.currentCategoryId && state.pendingCategoryIds.length > 0) {
                state.currentCategoryId = state.pendingCategoryIds.shift() || null;
                state.stage = 'sub_service_selection';
            }

            if (currentBotAsked === 'name' && !state.clientName) {
                if (msg.content.length > 2) {
                    state.clientName = extractName(msg.content);
                }
            }
            if (currentBotAsked === 'phone' && !state.clientPhone) {
                if (intent === 'afirmacion_o_agregar_carrito' || normalizedContent.includes("este mismo") || normalizedContent.includes("si")) {
                    state.clientPhone = 'CONFIRMED_CURRENT';
                } else {
                    const phoneMatch = msg.content.match(/\d{8,15}/);
                    if (phoneMatch) state.clientPhone = phoneMatch[0];
                }
            }
            
            if (currentBotAsked === 'sub_service') {
                const inputParts = normalizedContent.split(/[\s,y+]+/).filter(p => p.length >= 3);
                const foundSvcs = services.filter(s => {
                    if (s.category_id !== state.currentCategoryId) return false;
                    const nt = normalizeText(s.title);
                    if (normalizedContent.includes(nt)) return true;
                    return inputParts.some(part => {
                        if (nt.includes(part)) return true;
                        const titleParts = nt.split(/\s+/);
                        return titleParts.some(tp => tp.length > 3 && getSimilarity(part, tp) > 0.8);
                    });
                });

                if (foundSvcs.length > 0) {
                    foundSvcs.forEach(fs => {
                        if (!state.selectedServiceIds.includes(fs.id)) state.selectedServiceIds.push(fs.id);
                    });
                    
                    if (state.pendingCategoryIds.length > 0) {
                        state.currentCategoryId = state.pendingCategoryIds.shift()!;
                        state.stage = 'sub_service_selection';
                    } else {
                        state.stage = 'cart_review';
                    }
                } else if (intent === 'negacion_o_cerrar_carrito' || normalizedContent.includes("ningun") || normalizedContent.includes("nada") || normalizedContent.includes("no gracias") || normalizedContent.includes("listo")) {
                    if (state.pendingCategoryIds.length > 0) {
                        state.currentCategoryId = state.pendingCategoryIds.shift()!;
                        state.stage = 'sub_service_selection';
                    } else {
                        state.stage = state.selectedServiceIds.length > 0 ? 'cart_review' : 'parent_selection';
                    }
                }
            }
            if (currentBotAsked === 'cart_review') {
                const isRemoval = normalizedContent.includes("quitar") || normalizedContent.includes("sacar") || normalizedContent.includes("eliminar") || normalizedContent.includes("borrar") || normalizedContent.includes("menos") || normalizedContent.includes("saca");
                
                if (isRemoval) {
                    const inputParts = normalizedContent.split(/[\s,y+]+/).filter(p => p.length >= 3);
                    const toRemove = state.selectedServiceIds.filter(sid => {
                        const s = services.find(x => x.id === sid);
                        if (!s) return false;
                        const nt = normalizeText(s.title);
                        return inputParts.some(part => {
                            if (nt.includes(part)) return true;
                            const titleParts = nt.split(/\s+/);
                            return titleParts.some(tp => tp.length > 3 && getSimilarity(part, tp) > 0.8);
                        });
                    });
                    
                    if (toRemove.length > 0) {
                        state.selectedServiceIds = state.selectedServiceIds.filter(sid => !toRemove.includes(sid));
                        state.stage = state.selectedServiceIds.length > 0 ? 'cart_review' : 'parent_selection';
                    }
                } else {
                    const foundSvcsToAdd = services.filter(s => {
                        const nt = normalizeText(s.title);
                        if (normalizedContent.includes(nt)) return true;
                        const inputParts = normalizedContent.split(/[\s,y+]+/).filter(p => p.length >= 3);
                        return inputParts.some(part => {
                            const titleParts = nt.split(/\s+/);
                            return titleParts.some(tp => tp.length > 3 && getSimilarity(part, tp) > 0.9);
                        });
                    });

                    const foundCatIds = categories
                        .filter(c => normalizedContent.includes(normalizeText(c.name)))
                        .map(c => c.id);

                    if (foundSvcsToAdd.length > 0 || foundCatIds.length > 0) {
                        foundSvcsToAdd.forEach(fs => {
                            if (!state.selectedServiceIds.includes(fs.id)) state.selectedServiceIds.push(fs.id);
                        });
                        foundCatIds.forEach(cid => {
                            if (!state.pendingCategoryIds.includes(cid) && state.currentCategoryId !== cid) {
                                state.pendingCategoryIds.push(cid);
                            }
                        });
                        
                        if (state.pendingCategoryIds.length > 0 && foundSvcsToAdd.length === 0) {
                            state.currentCategoryId = state.pendingCategoryIds.shift()!;
                            state.stage = 'sub_service_selection';
                        } else {
                            state.stage = 'cart_review';
                        }
                    } else if (intent === 'afirmacion_o_agregar_carrito' || normalizedContent.includes("si") || normalizedContent.includes("correcto") || normalizedContent.includes("bien") || normalizedContent.includes("adelante") || normalizedContent.includes("confirmar") || normalizedContent.includes("estamos")) {
                         state.stage = 'name_collection';
                    } else if (intent === 'negacion_o_cerrar_carrito' || normalizedContent.includes("modificar") || normalizedContent.includes("cambiar") || normalizedContent.includes("no")) {
                         state.stage = 'parent_selection';
                    }
                }
            }
            if (currentBotAsked === 'cart_confirmation') {
                if (intent === 'afirmacion_o_agregar_carrito' || normalizedContent.includes("si") || normalizedContent.includes("mas")) {
                    state.stage = 'parent_selection';
                } else if (intent === 'negacion_o_cerrar_carrito' || intent === 'pedir_turno_general' || normalizedContent.includes("no") || normalizedContent.includes("turno")) {
                    state.stage = 'name_collection';
                }
            }
            if (currentBotAsked === 'availability') {
                if (intent === 'negacion_o_cerrar_carrito' || normalizedContent.includes("otro") || normalizedContent.includes("no puedo") || normalizedContent.includes("que mas hay")) {
                    if (state.pendingDate) state.rejectedDates.push(`${state.pendingDate} ${state.pendingTime}`);
                    state.requestedAllOptions = normalizedContent.includes("otro") || normalizedContent.includes("que mas");
                } else if (intent === 'afirmacion_o_agregar_carrito' || normalizedContent.includes("si") || normalizedContent.includes("bien") || normalizedContent.includes("dale")) {
                    state.stage = 'payment_request';
                }
            }
        }
    }

    if (state.selectedServiceIds.length > 0 && state.pendingCategoryIds.length === 0) {
        if (state.stage !== 'sub_service_selection' && state.stage !== 'cart_review' && state.stage !== 'availability_proposal' && state.stage !== 'payment_request' && state.stage !== 'done' && state.stage !== 'waiting_for_receipt') {
            if (!state.clientName) state.stage = 'name_collection';
            else if (!state.clientPhone) state.stage = 'phone_collection';
            else if (!state.pendingDate) state.stage = 'availability_proposal';
        }
    }

    return state;
}

function generateResponse(
    state: ConvState,
    categories: any[],
    services: any[],
    availableSlots: any[],
    isFromWhatsApp: boolean,
    hasMediaInLastMsg: boolean
): string {
    const welcome = isFromWhatsApp ? "¡Hola! Qué lindo saludarte. Bienvenida a *KÂLON Estética* ✨. " : "";
    
    if (state.stage === 'waiting_for_receipt' && hasMediaInLastMsg) {
        return "¡Excelente noticia! 💖 Recibimos tu comprobante correctamente. Tu turno ya quedó agendado y confirmado en nuestro sistema. ¡Qué placer va a ser recibirte en KÂLON para mimarte un rato! Nos vemos pronto. ✨";
    }

    switch (state.stage) {
        case 'greeting':
        case 'parent_selection': {
            const catList = categories.map(c => `• *${c.name}*`).join('\n');
            const intro = state.selectedServiceIds.length > 0 
                ? "¡Claro que sí! Contame, ¿qué otra cosita te gustaría sumarte hoy? 😊\n\n" 
                : `${welcome}Soy tu asistente virtual y estoy acá para ayudarte a reservar un momento para vos. Contame, ¿qué servicios te interesan hoy?\n\n`;
            return `${intro}${catList}\n\nEscribí el nombre de la categoría para ver los tratamientos.`;
        }
        case 'sub_service_selection': {
            const cat = categories.find(c => c.id === state.currentCategoryId);
            const subServices = services.filter(s => s.category_id === state.currentCategoryId);
            const list = subServices.map(s => `• *${s.title}* ($${s.price}) - ${s.duration} min`).join('\n');
            
            const selectedCount = state.selectedServiceIds.length;
            const prefix = selectedCount > 0 
                ? `¡Qué buena elección! Ya te sumé lo anterior. 💖 Ahora contame, de *${cat?.name}*, ¿cuál te gustaría realizarte?\n\n`
                : `¡Perfecto! Estos son los tratamientos que tenemos en *${cat?.name}*. ¿Cuál te gustaría realizarte?\n\n`;
            
            return `${prefix}${list}\n\nSolo escribí el nombre del tratamiento y lo agrego a tu plan.`;
        }
        case 'cart_review': {
            const selectedServices = services.filter(s => state.selectedServiceIds.includes(s.id));
            const list = selectedServices.map(s => `• *${s.title}* ($${s.price}) - ${s.duration} min`).join('\n');
            const totalPrice = selectedServices.reduce((a, b) => a + Number(b.price), 0);
            const totalDur = selectedServices.reduce((a, b) => a + (Number(b.duration) || 60), 0);
            const durText = formatDurationHuman(totalDur);

            return `¡Excelente! 🎉 Revisemos tu pedido para que esté todo perfecto:\n\n${list}\n\n💰 *Total:* $${totalPrice}\n⏳ *Duración estimada:* ${durText}\n\n¿Es correcto o te gustaría agregar o modificar algo?`;
        }
        case 'cart_confirmation': {
             const selectedNames = services.filter(s => state.selectedServiceIds.includes(s.id)).map(s => s.title).join(', ');
             return `¡Qué lindo lo que elegiste! 😍 Actualmente tenés en tu carrito: *${selectedNames}*.\n\n¿Te gustaría sumar algo más o ya buscamos un lugarcito en nuestra agenda para vos?`;
        }
        case 'name_collection': {
            const selectedServices = services.filter(s => state.selectedServiceIds.includes(s.id));
            const totalPrice = selectedServices.reduce((a, b) => a + Number(b.price), 0);
            const totalDur = selectedServices.reduce((a, b) => a + (Number(b.duration) || 60), 0);
            const durText = formatDurationHuman(totalDur);
            
            return `¡Perfecto! Todo confirmado. ✨ Entonces, el total es de *$${totalPrice}* por una sesión de *${durText}*.\n\nPara ir agendándote, ¿cómo es tu nombre completo? 😊`;
        }
        case 'phone_collection': {
            const greeting = `¡Un gusto conocerte, *${state.clientName}*! 😊 `;
            if (isFromWhatsApp) {
                return `${greeting}¿Te registro con este mismo número de WhatsApp o preferís usar otro para los recordatorios?`;
            }
            return `${greeting}Por favor, decime tu número de WhatsApp así te mando el comprobante de reserva y no te olvidás de nada. 📱`;
        }
        case 'availability_proposal': {
            if (availableSlots.length > 0) {
                const totalDur = services.filter(s => state.selectedServiceIds.includes(s.id)).reduce((a, b) => a + (Number(b.duration)||60), 0);
                const durText = formatDurationHuman(totalDur);
                
                if (availableSlots.length === 1) {
                    const slot = availableSlots[0];
                    return `¡Buenas noticias! ✨ Tengo disponibilidad para tus tratamientos (Duración total: *${durText}*) el día *${formatDateHuman(slot.date)}* a las *${slot.time}hs*. 🗓️\n\n¿Te queda bien este horario o preferís que busquemos otro?`;
                } else {
                    const options = availableSlots.map(s => `• *${formatDateHuman(s.date)}* a las *${s.time}hs*`).join('\n');
                    return `¡Claro! 😊 Para que elijas tranquila, acá tenés las opciones más cercanas disponibles (Duración: *${durText}*):\n\n${options}\n\n¿Cuál de estos te gusta más?`;
                }
            }
            return "Uy, parece que tengo la agenda súper llena para esa duración total esta semana. 🗓️ ¿Querés que busquemos para la semana que viene así te aseguro un lugar? 😊";
        }
        case 'payment_request': {
            const selectedSvc = services.filter(s => state.selectedServiceIds.includes(s.id));
            const totalPrice = selectedSvc.reduce((a, b) => a + Number(b.price), 0);
            const totalDur = selectedSvc.reduce((a, b) => a + (Number(b.duration) || 60), 0);
            const deposit = totalPrice * 0.5;
            const durText = formatDurationHuman(totalDur);

            return `¡Todo listo! ✨ Tu sesión va a durar aproximadamente *${durText}* y el valor total es de *$${totalPrice}*.\n\nPara confirmar definitivamente tu lugarcito el *${formatDateHuman(state.pendingDate || '')}* a las *${state.pendingTime}hs*, necesitamos una seña del 50% (*$${deposit.toFixed(0)}*).\n\nTransferí al alias: *KALON.ESTETICA.OK* y mandame la fotito del comprobante por acá. ¡Ya falta nada! 📸`;
        }
        case 'waiting_for_receipt':
            return "Quedo atenta a tu comprobante de transferencia para terminar de confirmar tu turno. ¡Cualquier duda decime! 😊";
        default:
            return "¡Hola! ¿En qué más puedo ayudarte hoy para que te sientas radiante? ✨";
    }
}

function formatForWhatsApp(text: string): string {
    return text.replace(/\*\*(.*?)\*\*/g, '*$1*').trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    const sql = neon(connectionString!);
    const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000000';

    try {
        const body = req.body || {};
        const incomingMessage = body.message || "";
        const userIdRaw = body.userId || "";
        const userId = userIdRaw ? userIdRaw.split('@')[0].replace(/\D/g, '') : null;
        let incomingMediaUrl = body.mediaUrl || null;
        
        if (!incomingMediaUrl && incomingMessage.includes('📸 [Imagen enviada]')) {
            const urlMatch = incomingMessage.match(/\((https?:\/\/[^)]+)\)/);
            if (urlMatch) incomingMediaUrl = urlMatch[1];
        }

        const categories = await sql`SELECT id, name FROM categories WHERE active = true ORDER BY sort_order ASC`;
        const services = await sql`SELECT id, category_id, title, price, duration FROM services WHERE active = true ORDER BY sort_order ASC`;
        
        let leadId = null;
        let isBotEnabled = true;

        if (userId) {
            const phone = userId.replace(/\D/g, '');
            const leadSearch = await sql`SELECT id, is_bot_enabled FROM leads WHERE regexp_replace(contact_info->>'phone', '\\D', '', 'g') LIKE ${'%' + phone} LIMIT 1` as any[];
            if (leadSearch.length > 0) {
                leadId = leadSearch[0].id;
                isBotEnabled = leadSearch[0].is_bot_enabled !== false;
            }
        }

        let messages = body.messages || [];
        if (userId && !messages.length && incomingMessage) {
            if (leadId) {
                const history = await sql`
                    SELECT role, content FROM chat_logs 
                    WHERE lead_id = ${leadId}
                    ORDER BY created_at ASC
                ` as any[];
                messages = history.length > 0 ? history : [];
            }
            messages.push({ role: 'user', content: incomingMessage });
        }

        const state = await extractState(messages, categories, services, isBotEnabled);
        
        if (leadId) {
            await sql`INSERT INTO chat_logs (lead_id, role, content, media_url, sent_to_whatsapp) 
                      VALUES (${leadId}, 'user', ${incomingMessage}, ${incomingMediaUrl}, ${!!userId})`;
        } else if (userId || body.clientPhone) {
             const phone = (userId || body.clientPhone || '').replace(/\D/g, '');
             const leadInsert = await sql`INSERT INTO leads (organization_id, client_name, contact_info, status, intent_score) 
                                   VALUES (${DEFAULT_ORG_ID}, 'Cliente', ${JSON.stringify({ phone: phone, source: userId ? 'whatsapp' : 'web' })}, 'qualified', 70) 
                                   RETURNING id` as any[];
             leadId = leadInsert[0].id;
             await sql`INSERT INTO chat_logs (lead_id, role, content, media_url, sent_to_whatsapp) 
                       VALUES (${leadId}, 'user', ${incomingMessage}, ${incomingMediaUrl}, ${!!userId})`;
        }

        if (!isBotEnabled) {
            return res.status(200).json({ status: 'bot_disabled' });
        }

        const foundSlots: any[] = [];
        if (state.stage === 'availability_proposal' && state.selectedServiceIds.length > 0) {
            const totalDur = services.filter(s => state.selectedServiceIds.includes(s.id)).reduce((a, b) => a + (Number(b.duration)||60), 0);
            
            const baseDate = state.requestedDate ? new Date(state.requestedDate + "T12:00:00Z") : new Date();
            if (!state.requestedDate) {
                baseDate.setDate(new Date().getDate() + 1);
            }

            const limit = state.requestedAllOptions ? 3 : 1;

            for (let d = 0; d < 30 && foundSlots.length < limit; d++) {
                const searchDate = new Date(baseDate);
                searchDate.setDate(baseDate.getDate() + d);
                
                if (searchDate.getDay() === 0) continue; 
                const dateStr = searchDate.toISOString().split('T')[0];

                const taken = await sql`SELECT date_time FROM appointments WHERE date_time::date = ${dateStr} AND status != 'canceled'`;
                const takenIntervals = taken.map(r => {
                    const start = new Date(r.date_time);
                    return { start: start.getUTCHours() * 60 + start.getUTCMinutes(), end: (start.getUTCHours() * 60 + start.getUTCMinutes()) + 60 };
                });

                let startSearch = 9 * 60;
                if (state.requestedTime && d === 0) {
                    const [rh, rm] = state.requestedTime.split(':').map(Number);
                    startSearch = Math.max(9 * 60, rh * 60 + rm);
                }

                for (let totalMin = startSearch; totalMin <= 20 * 60 - totalDur; totalMin += 30) {
                    const potentialStart = totalMin;
                    const potentialEnd = totalMin + totalDur;
                    const h = Math.floor(potentialStart / 60);
                    const m = potentialStart % 60;
                    const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

                    if (state.rejectedDates.includes(`${dateStr} ${timeStr}`)) continue;
                    
                    let overlaps = false;
                    for (const interval of takenIntervals) {
                        if (potentialStart < interval.end && potentialEnd > interval.start) {
                            overlaps = true;
                            break;
                        }
                    }
                    
                    if (!overlaps) {
                        foundSlots.push({ date: dateStr, time: timeStr });
                        if (foundSlots.length >= limit) break;
                    }
                }
            }
            if (foundSlots.length > 0) {
                state.pendingDate = foundSlots[0].date;
                state.pendingTime = foundSlots[0].time;
            }
        }

        if ((state.stage === 'waiting_for_receipt' || state.stage === 'payment_request') && (incomingMediaUrl || body.mediaData)) {
            if (leadId) {
                const svcTitles = services.filter(s => state.selectedServiceIds.includes(s.id)).map(s => s.title).join(' + ');
                const dateTime = `${state.pendingDate}T${state.pendingTime}:00Z`;
                await sql`INSERT INTO appointments (lead_id, organization_id, date_time, service_type, status) 
                          VALUES (${leadId}, ${DEFAULT_ORG_ID}, ${dateTime}, ${svcTitles}, 'confirmed')`;
                state.stage = 'done';
            }
        }

        const responseText = generateResponse(state, categories, services, foundSlots, !!userId, !!(incomingMediaUrl || body.mediaData));
        
        if (leadId) {
            await sql`INSERT INTO chat_logs (lead_id, role, content, sent_to_whatsapp) 
                      VALUES (${leadId}, 'bot', ${responseText}, ${!!userId})`;
        }

        if (userId) {
            return res.status(200).json({ 
                responseText: formatForWhatsApp(responseText), 
                stage: state.stage 
            });
        } else {
            // Web SSE
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            const words = responseText.split(' ');
            for (let i = 0; i < words.length; i++) {
                const chunk = (i === 0 ? '' : ' ') + words[i];
                const data = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
                res.write(`data: ${data}\n\n`);
                await new Promise(r => setTimeout(r, 30 + Math.random() * 30));
            }
            res.write('data: [DONE]\n\n');
            res.end();
        }
    } catch (e: any) {
        console.error("Chat API Error:", e);
        if (!res.writableEnded) {
            res.status(500).json({ error: e.message });
        }
    }
}
