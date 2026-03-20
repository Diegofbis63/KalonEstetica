
import { 
    normalizeText, 
    getSimilarity, 
    extractName, 
    formatDateHuman, 
    formatDurationHuman, 
    parseDuration, 
    parseRelativeDate,
    formatPrice 
} from './utils.js';
import { getNlpManager } from './nlp.js';

export interface ChatMessage {
    role: string;
    content: string;
    media_url?: string;
    media_data?: string;
    created_at?: string;
}

export interface ConvState {
    clientName: string | null;
    clientPhone: string | null;
    selectedServiceIds: string[];
    currentCategoryId: string | null;
    pendingCategoryIds: string[];
    stage: 'greeting' | 'parent_selection' | 'sub_service_selection' | 'cart_review' | 'cart_confirmation' | 'name_collection' | 'phone_collection' | 'availability_proposal' | 'payment_request' | 'waiting_for_receipt' | 'done';
    pendingDate: string | null;
    pendingTime: string | null;
    requestedDate: string | null;
    requestedTime: string | null;
    rejectedDates: string[];
    requestedAllOptions: boolean;
    lastIntent?: string;
    isBotEnabled: boolean;
    currentFlow?: 'none' | 'booking_funnel';
    errorType?: 'service_not_found' | 'category_not_found' | 'unrecognized_cart_action' | 'ask_what_to_remove' | 'ask_what_to_modify' | 'ask_what_to_add';
    optionMap?: Record<string, string>; // Mapping numbers (1, 2, 3) to IDs (Category/Service)
}

export interface Category {
    id: string;
    name: string;
}

export interface Service {
    id: string;
    category_id: string;
    title: string;
    price: number | string;
    duration: string;
    category_name?: string;
}

export interface Slot {
    date: string;
    time: string;
}

export async function extractState(
    messages: ChatMessage[], 
    categories: Category[], 
    services: Service[],
    defaultIsBotEnabled: boolean = true,
    initialName: string | null = null,
    initialPhone: string | null = null,
    initialState: ConvState | null = null,
    lastUpdatedAt: string | Date | null = null
): Promise<ConvState> {
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    // CORRET TIME FOR ARGENTINA (GMT-3)
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Argentina/Cordoba"}));
    let resetCause: string | null = null;
    
    if (initialState) {
        // 1. Reset by time (Desmayo del Carrito) - Priority #1
        if (lastUpdatedAt) {
            const lastUpdate = new Date(lastUpdatedAt);
            const timeDiff = now.getTime() - lastUpdate.getTime();
            const ONE_HOUR = 60 * 60 * 1000;
            const TWELVE_HOURS = 12 * ONE_HOUR;

            if (initialState.stage === 'done') {
                if (timeDiff > TWELVE_HOURS) resetCause = 'timeout';
            } else {
                if (timeDiff > ONE_HOUR) resetCause = 'timeout';
            }
        }

        // 2. Logic check for 'done' stage (Courtesy Shield) - Priority #2
        if (initialState.stage === 'done' && !resetCause) {
            const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
            const normalizedText = lastMsg ? normalizeText(lastMsg.content || "") : "";
            // Regex to detect if message is ONLY emojis (plus potential whitespace)
            const isEmojiOnly = lastMsg?.content ? /^(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|[ \t\n\r\f\v])+$/.test(lastMsg.content.trim()) : false;

            const courtesyWords = ['gracias', 'muchas gracias', 'genial', 'buenisimo', 'chau', 'nos vemos', 'perfecto', 'mil gracias', 'muchisimas', 'joya', 'barbaro', 'espectacular'];
            
            // Check intents
            const nlp = await getNlpManager();
            const nlpResult = lastMsg?.content ? await nlp.process('es', lastMsg.content) : null;
            const intent = nlpResult?.intent;

            const isCourtesy = intent === 'cortesia' || courtesyWords.some(kw => normalizedText.includes(kw)) || isEmojiOnly;

            // Check for "Reset triggers" (intents for new booking or category names)
            const isNewBookingIntent = ['saludo', 'pedir_turno_general', 'listar_servicios'].includes(intent);
            const mentionsCategory = categories.some(c => normalizedText.includes(normalizeText(c.name)));
            const wantsRebookEarly = normalizedText.includes('otro turno') || normalizedText.includes('agendar para') || normalizedText.includes('sacar otro') || normalizedText.includes('nuevo turno');

            if (isNewBookingIntent || mentionsCategory || wantsRebookEarly) {
                resetCause = 'new_request';
            } else if (isCourtesy) {
                // SHIELD: Stay in 'done' and flag it to generate a brief response
                console.log("[stateMachine.ts] Courtesy detected. Shielding 'done' state.");
                const resultState = { ...initialState, lastIntent: 'courtesy_ack' };
                return resultState;
            } else {
                // If it's silence or unrecognized but not a clear new request, stay in done
                return { ...initialState };
            }
        }
    }

    if (resetCause) {
        console.log(`[stateMachine.ts] Session RESET triggered. Cause: ${resetCause}`);
        // If we reset, we MUST only process the LATEST message as a fresh start
    }

    console.log(`[stateMachine.ts] Extracting state. InitialName: ${initialName}, InitialPhone: ${initialPhone}, HasInitialState: ${!!initialState}, Reset: ${resetCause || 'no'}`);
    
    // --- 0. STATE MIGRATION & SANITY CHECK ---
    const migrateState = (oldState: Partial<ConvState>): ConvState => {
        const out: ConvState = {
            // Rule #2: Neon as Source of Truth - Prioritize initialName/initialPhone from DB
            clientName: (initialName && initialName !== 'Cliente') ? initialName : (oldState?.clientName || null),
            clientPhone: initialPhone || oldState?.clientPhone || null,
            selectedServiceIds: Array.isArray(oldState?.selectedServiceIds) ? [...(oldState.selectedServiceIds as string[])] : [],
            currentCategoryId: typeof oldState?.currentCategoryId === 'string' ? oldState.currentCategoryId : null,
            pendingCategoryIds: Array.isArray(oldState?.pendingCategoryIds) ? oldState.pendingCategoryIds : [],
            stage: oldState?.stage || 'greeting',
            pendingDate: oldState?.pendingDate || null,
            pendingTime: oldState?.pendingTime || null,
            requestedDate: oldState?.requestedDate || null,
            requestedTime: oldState?.requestedTime || null,
            rejectedDates: Array.isArray(oldState?.rejectedDates) ? [...new Set(oldState.rejectedDates as string[])] : [],
            requestedAllOptions: !!oldState?.requestedAllOptions,
            isBotEnabled: oldState?.isBotEnabled !== false && defaultIsBotEnabled,
            optionMap: oldState?.optionMap || {}
        };
        return out;
    };

    const state: ConvState = (initialState && !resetCause) ? migrateState(initialState) : {
        clientName: initialName && initialName !== 'Cliente' ? initialName : null,
        clientPhone: initialPhone || null,
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

    // Clear previous errors
    delete state.errorType;

    // --- 1. SPECIAL CASE: RE-BOOKING OR START OVER ---
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const lastNormalized = lastUserMsg ? normalizeText(lastUserMsg.content || "") : "";
    const wantsRebook = lastNormalized.includes('otro turno') || lastNormalized.includes('agendar para') || lastNormalized.includes('sacar otro') || lastNormalized.includes('nuevo turno');
    const wantsReset = lastNormalized === 'hola' || lastNormalized === 'empezar' || lastNormalized === 'inicio' || lastNormalized === 'chau' || wantsRebook;
    
    if (wantsReset) {
        if (state.stage === 'waiting_for_receipt' || state.stage === 'done' || state.stage === 'greeting' || state.stage === 'cart_review') {
            console.log("[stateMachine.ts] User requested reset or re-booking from terminal or early state.");
            state.stage = 'greeting';
            state.selectedServiceIds = [];
            state.pendingCategoryIds = [];
            state.currentCategoryId = null;
            state.pendingDate = null;
            state.pendingTime = null;
            state.requestedDate = null;
            state.requestedTime = null;
            // Note: clientName and clientPhone are structurally preserved by the state map.
        }
    }

    // --- 2. ANTI-AMNESIA (History Backtracking) ---
    // Only run if the state is very fresh or missing context but has services
    if (state.stage === 'greeting' && state.selectedServiceIds.length > 0 && messages.length > 2) {
        let lastKnownStage: ConvState['stage'] | null = null;
        for (let k = messages.length - 1; k >= 0; k--) {
            const m = messages[k];
            if (m.role === 'assistant' || m.role === 'bot') {
                const t = normalizeText(m.content);
                if (t.includes("necesitamos una sena") || t.includes("alias") || t.includes("comprobante")) { lastKnownStage = 'payment_request'; break; }
                if (t.includes("confirmar el turno") || t.includes("disponibilidad") || t.includes("te queda bien")) { lastKnownStage = 'availability_proposal'; break; }
                if (t.includes("tu nombre") || t.includes("nombre completo")) { lastKnownStage = 'name_collection'; break; }
                if (t.includes("tu carrito") || t.includes("revisemos tu pedido")) { lastKnownStage = 'cart_review'; break; }
                if (t.includes("elige una categoria") || t.includes("nuestras categorias")) { lastKnownStage = 'parent_selection'; break; }
            }
        }
        if (lastKnownStage) {
            state.stage = lastKnownStage;
            console.log(`[stateMachine.ts] BACKTRACKING: Recovered ${lastKnownStage} from history.`);
        }
    }

    // ANTI-AMNESIA LOGIC: Conversational Rebuild
    // IF the state is lost (greeting/null) AND it's not a deliberate reset, we process the FULL HISTORY (User messages only) to reconstruct context.
    const isStateLost = (state.stage === 'greeting' && state.selectedServiceIds.length === 0 && !wantsReset);
    const messagesToProcess = (isStateLost && messages.length > 1) 
        ? messages.filter(m => m.role === 'user') 
        : (messages.length > 0 ? [messages[messages.length - 1]] : []);
    
    if (isStateLost && messages.length > 1) {
        console.log(`[stateMachine.ts] AMNESIA DETECTED. Reconstructing state from ${messages.length} messages...`);
    }

    try {
        // Rule #3: HOY es HOY en Argentina (GMT-3) - GLOBAL SYNC
        const nowArg = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Argentina/Cordoba"}));
        const today = new Date(nowArg.getFullYear(), nowArg.getMonth(), nowArg.getDate());
        
        console.log(`[stateMachine.ts] Global Time Sync: Now in Cordoba: ${nowArg.toISOString()} | Reference Today: ${today.toISOString().split('T')[0]}`);

        if (messagesToProcess.length === 0) return state;

        const nlp = await getNlpManager();

        const getBotAskedIntent = (botText: string): string | null => {
            if (botText.includes("elige una categoria") || botText.includes("nuestras categorias")) return 'category';
            if (botText.includes("servicios de") || botText.includes("tratamientos de") || botText.includes("estos son los tratamientos")) return 'sub_service';
            if (botText.includes("revisemos tu pedido") || botText.includes("tu carrito") || botText.includes("listado de todos")) return 'cart_review';
            if (botText.includes("agregar algo mas") || botText.includes("avanzamos con el turno")) return 'cart_confirmation';
            if (botText.includes("tu nombre") || botText.includes("nombre completo") || botText.includes("con quien tengo") || botText.includes("nombre y apellido")) return 'name';
            if (botText.includes("whatsapp") || botText.includes("este mismo numero") || botText.includes("numero de cel")) return 'phone';
            if (
                botText.includes("proximo horario") || botText.includes("disponibilidad") || botText.includes("te queda bien") || 
                botText.includes("busquemos otro") || botText.includes("horario me queda") || botText.includes("te sirve este horario") || 
                botText.includes("podemos agendar") || botText.includes("para el dia") || botText.includes("buenas noticias") || 
                botText.includes("elegir tranquila") || botText.includes("opciones mas cercanas")
            ) return 'availability';
            if (botText.includes("necesitamos una seña") || botText.includes("transferi al alias") || botText.includes("comprobante por aca") || botText.includes("senar") || botText.includes("pago de la reserva")) return 'payment';
            return null;
        };

        let currentBotAsked: string | null = null;

        for (let i = 0; i < messagesToProcess.length; i++) {
            const msg = messagesToProcess[i];
            if (!msg.content && !msg.media_url && !msg.media_data) continue;
            // Translate number selection from map if exists
            const rawContent = msg.content || "";
            const isNumberSelection = /^\d+$/.test(rawContent.trim());
            let normalizedContent = normalizeText(rawContent);

            if (isNumberSelection && state.optionMap && state.optionMap[rawContent.trim()]) {
                const targetId = state.optionMap[rawContent.trim()];
                // Case 1: ID is a category
                const cat = categories.find(c => c.id === targetId);
                if (cat) normalizedContent = normalizeText(cat.name);
                // Case 2: ID is a service
                const svc = services.find(s => s.id === targetId);
                if (svc) normalizedContent = normalizeText(svc.title);

                console.log(`[stateMachine] Translated number ${rawContent.trim()} -> ${normalizedContent} (ID: ${targetId})`);
            }

            // Skip bot messages in processing loop (already handled context)
            if (msg.role === 'assistant' || msg.role === 'bot') continue;

            if (isStateLost && messages.length > 1) {
                // Find the bot message that happened directly before THIS user message
                const msgIndex = messages.indexOf(msg);
                const prevBotMsg = [...messages].slice(0, msgIndex).reverse().find(m => m.role === 'assistant' || m.role === 'bot');
                if (prevBotMsg) {
                    currentBotAsked = getBotAskedIntent(normalizeText(prevBotMsg.content));
                }
            } else {
                // Normal flow: check the absolute last bot message
                const lastBotMsg = [...messages].reverse().find(m => m.role === 'assistant' || m.role === 'bot');
                if (lastBotMsg) currentBotAsked = getBotAskedIntent(normalizeText(lastBotMsg.content));
            }

            if (msg.role === 'user') {
                const isLastMessage = i === messages.length - 1;
                const hasMedia = !!(msg.media_url || msg.media_data || (msg.content && msg.content.includes("📸 [Imagen enviada]")));
                
                const nlpResult = msg.content ? await nlp.process('es', msg.content) : null;
                const intent = nlpResult?.intent;
                if (isLastMessage) state.lastIntent = intent;

                // --- HIGH PRIORITY MEDIA INTERCEPTOR ---
                // If the user sends an image while we have an active booking session, 
                // we treat it as a receipt immediately to avoid NLP misinterpretation.
                if (hasMedia) {
                    const isPotentiallyWaiting = ['availability_proposal', 'payment_request', 'waiting_for_receipt'].includes(state.stage);
                    const hasBookingContext = state.selectedServiceIds.length > 0 || (state.pendingDate && state.pendingTime);
                    
                    if (isPotentiallyWaiting || hasBookingContext) {
                        state.stage = 'waiting_for_receipt';
                        console.log(`[stateMachine.ts] Turn ${i}: High-Priority Media Detection. Stage -> waiting_for_receipt`);
                        continue; // Skip further processing for this turn
                    }
                }

                // Global intent handling - STICKY FLOW PROTECTION
                if (intent === 'saludo' || intent === 'pedir_turno_general' || intent === 'listar_servicios') {
                    const hasSelectedServices = state.selectedServiceIds.length > 0;
                    const isAlreadyBooking = ['name_collection', 'phone_collection', 'availability_proposal', 'payment_request', 'waiting_for_receipt', 'done'].includes(state.stage);

                    if (isAlreadyBooking || hasSelectedServices || state.stage === 'cart_review') {
                        // Protected flow: Don't allow hello/general intents to reset the booking
                        console.log(`[stateMachine.ts] Turn ${i}: Stickiness protection active (Stage: ${state.stage})`);
                        
                        if (intent === 'listar_servicios' && state.stage === 'sub_service_selection') {
                            state.stage = 'parent_selection';
                        }
                    } else if (state.stage === 'greeting' || !hasSelectedServices) {
                        state.stage = 'parent_selection';
                    }
                }

                // --- Relative Date & Time Detection (Rule #3/Sanidad Temporal) ---
                const relDate = parseRelativeDate(msg.content, today);
                const timeMatch = msg.content.match(/(\d{1,2})(:|\s?hs?|y\s)(\d{2})?/i);
                
                if (relDate || timeMatch) {
                    // Sanity Check: If we found a date/time, we override any 'stale' or past state
                    if (relDate) {
                        const relDateLocal = relDate; // e.g. "2026-03-18"
                        const todayStr = today.toISOString().split('T')[0];
                        
                        if (relDateLocal >= todayStr) {
                             state.requestedDate = relDateLocal;
                             state.pendingDate = null;
                             state.pendingTime = null;
                             console.log(`[stateMachine.ts] Turn ${i}: Fresh Date detected: ${relDateLocal}`);
                        } else {
                             console.log(`[stateMachine.ts] Turn ${i}: Ignoring past date from history: ${relDateLocal}`);
                             // Don't set requestedDate if it's in the past
                        }
                    }
                    if (timeMatch) {
                        let h = parseInt(timeMatch[1]);
                        const m = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
                        if (h < 9) h += 12;
                        const formattedTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                        
                        state.requestedTime = formattedTime;
                        state.pendingDate = null;
                        state.pendingTime = null;
                        console.log(`[stateMachine.ts] Turn ${i}: Fresh Time detected: ${formattedTime}`);
                    }
                    if (state.selectedServiceIds.length > 0) {
                          state.stage = 'availability_proposal';
                    }
                }

                // --- Global Service Detection (Priority: Anti-Inversion) ---
                const isRemoval = ["quitar", "sacar", "eliminar", "borrar", "menos", "quita", "saca", "elimina", "borra"].some(w => normalizedContent.includes(w)) || intent === 'negacion_o_cerrar_carrito';
                
                if (!isRemoval && ['greeting', 'parent_selection', 'sub_service_selection'].includes(state.stage)) {
                    const matchedSvc = services.find(s => {
                        const nt = normalizeText(s.title);
                        const lc = normalizedContent;
                        // Avoid implicit matches like "uñas" triggering "uñas esculpidas". Must explicitly mention the service title.
                        // Or a substantial part of it (>6 chars)
                        const isGeneric = ['unas', 'cejas', 'masaje', 'masajes', 'depilacion', 'lifting', 'perfilado'].includes(lc);
                        if (isGeneric) return false;
                        
                        return (nt.length > 4 && lc.includes(nt)) || (lc.length > 6 && nt.includes(lc));
                    });
                    
                    if (matchedSvc) {
                        // Only auto-add if we are not actively traversing a category sequence OR if the matched service belongs to the current category being chosen.
                        if (state.pendingCategoryIds.length === 0 || state.currentCategoryId === matchedSvc.category_id) {
                            if (!state.selectedServiceIds.includes(matchedSvc.id)) {
                               state.selectedServiceIds.push(matchedSvc.id);
                            }
                            state.stage = 'cart_review';
                            state.currentCategoryId = null;
                            state.currentFlow = 'booking_funnel';
                            console.log(`[stateMachine.ts] Turn ${i}: Intercepted Strict Global Service: ${matchedSvc.title}`);
                            continue;
                        }
                    }
                }
                // --- Multi-Category Detection ---
                const isAlreadyBooking = ['name_collection', 'phone_collection', 'availability_proposal', 'payment_request', 'waiting_for_receipt', 'done'].includes(state.stage);
                const hasExplicitCategoryIntent = intent === 'listar_servicios' || intent === 'saludo';
                
                const catsInFoundOrder = (!isAlreadyBooking || hasExplicitCategoryIntent) 
                    ? categories
                        .filter(c => normalizedContent.includes(normalizeText(c.name)))
                        .map(c => ({ id: c.id, name: c.name, pos: normalizedContent.indexOf(normalizeText(c.name)) }))
                        .sort((a, b) => a.pos - b.pos)
                    : [];
                
                let categoriesRequestedInThisTurn = false;
                catsInFoundOrder.forEach(c => {
                    if (!state.pendingCategoryIds.includes(c.id) && state.currentCategoryId !== c.id) {
                        const hasSvcFromCat = state.selectedServiceIds.some(sid => services.find(s => s.id === sid)?.category_id === c.id);
                        if (!hasSvcFromCat) {
                            state.pendingCategoryIds.push(c.id);
                            categoriesRequestedInThisTurn = true;
                        }
                    }
                });

                if (!state.currentCategoryId && state.pendingCategoryIds.length > 0) {
                    state.currentCategoryId = state.pendingCategoryIds.shift() || null;
                    state.stage = 'sub_service_selection';
                }

                if (!state.clientName || state.clientName === 'Cliente') {
                    const isNamePrompt = currentBotAsked === 'name' || state.stage === 'name_collection';
                    const hasIntro = normalizedContent.includes("mi nombre es") || normalizedContent.includes("soy ");
                    // SEAL: If we are in scheduling flow, don't try to capture name unless explicitly asked
                    const isSchedulingIntent = (relDate || timeMatch) && state.stage === 'availability_proposal';
                    
                    if ((isNamePrompt || hasIntro) && !isSchedulingIntent) {
                        if (msg.content && msg.content.length > 2 && msg.content.length < 50) {
                            const catWords = categories.map(c => normalizeText(c.name)).flatMap(n => n.split(/\s+/));
                            const svcWords = services.map(s => normalizeText(s.title)).flatMap(n => n.split(/\s+/));
                            
                            const confirmWords = ['si', 'correcto', 'perfecto', 'bien', 'dale', 'ok', 'listo', 'avanzar', 'genial', 'obvio', 'confirmo', 'avancemos', 'adelante', 'estamos', 'esta bien', 'asi esta bien', 'confirmar', 'buenisimo', 'excelente', 'de 10', 'de diez', 'bueno', 'bueno dale', 'es correcto'];
                            const notNames = [
                                "si", "no", "hola", "chau", "nada", "turno", "bien", "dale", "otro", "adelante", "perfecto", "listo", "agregar", "sacar", "quitar", "sumar", "mas", "menos",
                                "extensiones", "pestañas", "uñas", "cejas", "lifting", "facial", "masaje", "depilacion", "corporal", "manicuria", "pedicuria", "esmalte",
                                ...confirmWords, ...catWords, ...svcWords
                            ];
                            
                            const isServiceSelectionTurn = catsInFoundOrder.length > 0;
                            const isBlockedCommand = notNames.some(word => 
                                normalizedContent === word || 
                                normalizedContent.startsWith(word + " ") || 
                                (word.length > 3 && normalizedContent.includes(word))
                            );

                            if ((!isBlockedCommand && !isServiceSelectionTurn) || hasIntro) {
                                const cleanName = extractName(msg.content);
                                if (cleanName && cleanName.length > 2 && !notNames.includes(normalizeText(cleanName))) {
                                    const lowerN = normalizeText(cleanName);
                                    if (!services.some(s => normalizeText(s.title).includes(lowerN)) && !categories.some(c => normalizeText(c.name).includes(lowerN))) {
                                        state.clientName = cleanName;
                                        if (state.selectedServiceIds.length === 0 && !state.currentCategoryId) {
                                            state.stage = 'parent_selection';
                                        } else if (!state.clientPhone) {
                                            state.stage = 'phone_collection';
                                        } else if (state.pendingDate && state.pendingTime) {
                                            state.stage = 'payment_request';
                                        } else {
                                            state.stage = 'availability_proposal';
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (currentBotAsked === 'phone' && (!state.clientPhone || state.clientPhone === 'Cliente')) {
                    if (intent === 'afirmacion_o_agregar_carrito' || normalizedContent.includes("este mismo") || normalizedContent.includes("si")) {
                        state.clientPhone = 'CONFIRMED_CURRENT';
                    } else {
                        const phoneMatch = msg.content.match(/\d{8,15}/);
                        if (phoneMatch) state.clientPhone = phoneMatch[0];
                    }
                }
                
                if (currentBotAsked === 'sub_service' || state.stage === 'sub_service_selection') {
                    // Detect if the user is AGAIN naming categories they already requested
                    // or if they are naming NEW categories.
                    const isNewCategoryRequest = catsInFoundOrder.some(c => !state.selectedServiceIds.some(sid => services.find(s => s.id === sid)?.category_id === c.id) && state.currentCategoryId !== c.id);
                    const isOnlyNamingCategories = isNewCategoryRequest && normalizedContent.length < (catsInFoundOrder.reduce((acc, c) => acc + c.name.length, 0) + 12);

                    if (!isOnlyNamingCategories && !isRemoval) {
                        const singularize = (w: string) => (w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w);
                        const inputWords = normalizedContent.split(/[\s,y+]+/).filter(p => p.length >= 3);
                        const singularInputWords = inputWords.map(singularize);
                        
                        const hasConjunction = /[\s,]+(y|e|con|[+])[\s,]+/.test(normalizedContent) || normalizedContent.includes(",");
                        
                        const categoryWords = categories.map(c => normalizeText(c.name)).flatMap(n => n.split(/\s+/)).map(singularize);
                        
                        const scoredSvcs = services.map(s => {
                            const nt = normalizeText(s.title);
                            const currentCat = categories.find(c => c.id === state.currentCategoryId);
                            const currentCatName = currentCat ? normalizeText(currentCat.name) : '';
                            
                            let score = 0;
                            let matchesDifferentiating = false;

                            // 1. Exact phrase match (Highest Priority)
                            if (normalizedContent === nt) score += 100;
                            else if (normalizedContent.includes(nt) && nt.length > currentCatName.length) score += 50;

                            // 2. Word matching
                            const titleWords = nt.split(/\s+/).filter(w => 
                                w.length >= 3 && 
                                !categoryWords.includes(singularize(w)) && 
                                !["con", "sin", "para", "los", "las", "del"].includes(w)
                            );
                            const singularTitleWords = titleWords.map(singularize);

                            if (titleWords.length === 0) {
                                if (normalizedContent === nt) score += 10;
                            } else {
                                singularTitleWords.forEach((tw, idx) => {
                                    if (singularInputWords.includes(tw)) {
                                        score += 10;
                                        matchesDifferentiating = true;
                                    } else if (tw.length > 3 && singularInputWords.some(iw => iw.includes(tw) || tw.includes(iw))) {
                                        score += 5;
                                        matchesDifferentiating = true;
                                    }
                                });
                            }

                            // Global match check
                            if (state.currentCategoryId && s.category_id !== state.currentCategoryId) {
                                if (score < 100 && !normalizedContent.includes(nt) && score < 40) score = 0; // Global must be strong match
                            }

                            return { service: s, score, matchesDifferentiating };
                        }).filter(res => res.score > 0);

                        let potentialSvcs: Service[] = [];
                        if (scoredSvcs.length > 0) {
                            // Find the max score
                            const maxScore = Math.max(...scoredSvcs.map(s => s.score));
                            
                            if (hasConjunction) {
                                // If conjunction, take all that have a decent score
                                potentialSvcs = scoredSvcs.filter(s => s.score >= 5).map(s => s.service);
                            } else {
                                // No conjunction: Filter candidates by family
                                potentialSvcs = scoredSvcs.filter(s => {
                                    if (s.score === maxScore) return true;
                                    const bestSvc = scoredSvcs.find(x => x.score === maxScore)!;
                                    if (s.service.category_id !== bestSvc.service.category_id && s.score >= 10) return true;
                                    return false;
                                }).map(s => s.service);
                            }
                        }

                        if (potentialSvcs.length > 0) {
                            potentialSvcs.forEach(fs => {
                                state.selectedServiceIds.push(fs.id);
                            });
                            
                            // PROGRESSION: If we added services, check if there are more categories or go to review
                            if (state.pendingCategoryIds.length > 0) {
                                state.currentCategoryId = state.pendingCategoryIds.shift()!;
                                state.stage = 'sub_service_selection';
                            } else {
                                state.stage = 'cart_review';
                                state.currentCategoryId = null;
                            }
                            // DOBLE SALTO PROTECTION: If we just finished selection for this turn, we STOP here.
                            // We don't want the next 'cart_review' block to process the SAME message again.
                            console.log(`[stateMachine.ts] Turn ${i}: Finished sub_service_selection. Breaking loop to prevent double jump.`);
                            continue; 
                        } else {
                            // Clear error if navigated elsewhere, else set if ambiguous or not found
                            const isAffirmation = intent === 'afirmacion_o_agregar_carrito' || normalizedContent.includes("si") || normalizedContent.includes("dale") || normalizedContent.includes("perfecto") || normalizedContent.includes("adelante") || normalizedContent.includes("asi esta bien") || normalizedContent.includes("listo");
                            const isNav = isAffirmation || intent === 'negacion_o_cerrar_carrito' || normalizedContent.includes("ningun") || normalizedContent.includes("nada") || normalizedContent.includes("no gracias") || normalizedContent.includes("bastante");
                            if (!isNav && !categoriesRequestedInThisTurn) {
                                state.errorType = 'service_not_found';
                            }
                        }
                    }
                }

                if (currentBotAsked === 'cart_review' || state.stage === 'cart_review') {
                    const isRemoval = ['quitar', 'quita ', 'quita', 'sacar', 'eliminar', 'elimina', 'borrar', 'borra', 'menos', 'saca'].some(w => normalizedContent.includes(w));
                    
                    if (isRemoval) {
                        const singularize = (w: string) => (w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w);
                        const inputParts = normalizedContent.split(/[\s,y+]+/).filter(p => p.length >= 3).map(singularize);
                        const toRemove = state.selectedServiceIds.filter(sid => {
                            const s = services.find(x => x.id === sid);
                            if (!s) return false;
                            const nt = normalizeText(s.title);
                            
                            // Does the message contain identifying words of THIS specific service?
                            if (normalizedContent.includes(nt)) return true;
                            
                            const svcParts = nt.split(/\s+/).filter(p => p.length > 3).map(singularize);
                            const identifyingPart = svcParts.find(p => ["ruso", "clasicas", "1x1", "polygel", "kapping", "lifting", "keratina"].includes(p));
                            
                            if (identifyingPart && normalizedContent.includes(identifyingPart)) return true;
                            
                            return inputParts.some(part => {
                                if (nt.includes(part) && svcParts.length === 1) return true;
                                const titleParts = nt.split(/\s+/).map(singularize);
                                return titleParts.some(tp => tp.length > 3 && getSimilarity(part, tp) > 0.95);
                            });
                        });
                        
                        if (toRemove.length > 0) {
                            // Enhanced logic to handle "remove 1" or specific counts
                            const countMatch = normalizedContent.match(/(\d+)\s*(vez|veces|x|unidad|unidades)?/);
                            const countToRemove = countMatch ? parseInt(countMatch[1]) : 0;

                            if (countToRemove > 0) {
                                // Remove specific number of occurrences
                                let removed = 0;
                                state.selectedServiceIds = state.selectedServiceIds.filter(sid => {
                                    if (toRemove.includes(sid) && removed < countToRemove) {
                                        removed++;
                                        return false;
                                    }
                                    return true;
                                });
                            } else {
                                // Standard: Remove all instances found in this turn matching the identification
                                state.selectedServiceIds = state.selectedServiceIds.filter(sid => !toRemove.includes(sid));
                            }
                            state.stage = state.selectedServiceIds.length > 0 ? 'cart_review' : 'parent_selection';
                        }
                    } else {
                        // --- 1. CORE CONFIRMATION LOGIC (STRICT) ---
                        const confirmWords = ['si', 'correcto', 'perfecto', 'bien', 'dale', 'ok', 'listo', 'avanzar', 'genial', 'obvio', 'confirmo', 'avancemos', 'adelante', 'estamos', 'esta bien', 'asi esta bien', 'confirmar', 'buenisimo', 'excelente', 'de 10', 'de diez', 'bueno', 'bueno dale', 'es correcto'];
                        const isUserConfirming = confirmWords.some(kw => 
                            normalizedContent === kw || 
                            normalizedContent.startsWith(kw + " ") || 
                            normalizedContent.endsWith(" " + kw)
                        ) || intent === 'afirmacion_o_agregar_carrito';

                        // --- 2. SERVICE ADDITION LOGIC ---
                        const singularize = (w: string) => (w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w);
                        const inputWords = normalizedContent.split(/[\s,y+]+/).filter(p => p.length >= 2).map(singularize);
                                           const matchedSvcs = services.filter(s => {
                            const nt = normalizeText(s.title);
                            const sn = nt.split(/\s+/).map(singularize);
                            if (normalizedContent.includes(nt)) return true;
                            // Strict keyword matching for additions
                            const keyWords = sn.filter(w => w.length > 3 && !["masaje", "limpieza", "pestaña", "uña"].some(g => w.includes(g)));
                            return keyWords.length > 0 && keyWords.every(kw => inputWords.includes(kw));
                        });

                        const newSvcsToAdd = !isRemoval ? matchedSvcs : [];

                        // --- 3. EXECUTION ORDER AND STATE TRANSITION (STRICT PRIORITY) ---
                        const removalWords = ["quitar", "sacar", "eliminar", "borrar", "menos", "quita", "saca", "elimina", "borra"];
                        const isRemovalIntent = removalWords.some(w => normalizedContent.includes(w) || normalizedContent.startsWith(w));

                        const isExplicitAdd = normalizedContent.includes("agregar") || normalizedContent.includes("sumar") || normalizedContent.includes("mas") || intent === 'afirmacion_o_agregar_carrito';
                        const isModificarIntent = normalizedContent.includes("modificar") || normalizedContent.includes("cambiar");

                        if (isRemovalIntent && state.selectedServiceIds.length > 0) {
                            state.stage = 'cart_review';
                            state.errorType = 'ask_what_to_remove';
                        } else if (isModificarIntent) {
                            state.stage = 'cart_review';
                            state.errorType = 'ask_what_to_modify';
                        } else if (isExplicitAdd && newSvcsToAdd.length === 0) {
                            // If they say "agregar" but don't specify a service, go to categories
                            state.stage = 'parent_selection';
                            state.currentCategoryId = null;
                            state.errorType = 'ask_what_to_add';
                        } else if (newSvcsToAdd.length > 0 && !isRemoval) {
                            newSvcsToAdd.forEach(fs => {
                                state.selectedServiceIds.push(fs.id);
                            });
                            state.stage = 'cart_review';
                            state.errorType = undefined;
                        } else if (isUserConfirming) {
                            state.stage = 'name_collection';
                            state.errorType = undefined;
                        } else if (intent === 'negacion_o_cerrar_carrito' || normalizedContent.includes("no")) {
                            state.stage = 'parent_selection';
                            state.errorType = undefined;
                        } else {
                            state.stage = 'cart_review';
                            state.errorType = 'unrecognized_cart_action';
                        }
                    }
                }

                if (currentBotAsked === 'cart_confirmation') {
                    if (intent === 'afirmacion_o_agregar_carrito' || normalizedContent.includes("si") || normalizedContent.includes("mas") || normalizedContent.includes("agregar")) {
                        state.stage = 'parent_selection';
                    } else if (intent === 'negacion_o_cerrar_carrito' || intent === 'pedir_turno_general' || normalizedContent.includes("no") || normalizedContent.includes("turno") || normalizedContent.includes("estamos") || normalizedContent.includes("asi esta bien")) {
                        state.stage = 'name_collection';
                    }
                }
                
                console.log(`[stateMachine] End of turn ${i}: Input='${msg.content}', stage='${state.stage}', cart=[${state.selectedServiceIds.join(',')}]`);
                
                if (currentBotAsked === 'availability') {
                    if (intent === 'negacion_o_cerrar_carrito' || normalizedContent.includes("otro") || normalizedContent.includes("no puedo") || normalizedContent.includes("que mas hay")) {
                        if (state.pendingDate) state.rejectedDates.push(`${state.pendingDate} ${state.pendingTime}`);
                        state.requestedAllOptions = normalizedContent.includes("otro") || normalizedContent.includes("que mas");
                    } else if (
                        intent === 'afirmacion_o_agregar_carrito' || 
                        intent === 'confirmar_horario' || 
                        normalizedContent.includes("si") || 
                        normalizedContent.includes("bien") || 
                        normalizedContent.includes("esta bien") || 
                        normalizedContent.includes("me sirve") || 
                        normalizedContent.includes("dale") || 
                        normalizedContent.includes("perfecto") || 
                        normalizedContent.includes("correcto") || 
                        normalizedContent.includes("anotame") || 
                        normalizedContent.includes("agendame") || 
                        normalizedContent.includes("ese horario") || 
                        normalizedContent.includes("esta perfecto") || 
                        normalizedContent.includes("perrrfecto") || 
                        normalizedContent.includes("confirmar") ||
                        normalizedContent.includes("me queda bien") ||
                        normalizedContent.includes("me va bien") ||
                        normalizedContent.includes("esta bien") ||
                        (normalizedContent.includes("turno") && (normalizedContent.includes("ese") || normalizedContent.includes("esta")))
                    ) {
                        if (state.clientName && state.clientName !== 'Cliente') {
                            state.stage = 'payment_request';
                            console.log(`[stateMachine.ts] Turn ${i}: Transition to payment_request (Availability confirmed)`);
                        } else {
                            state.stage = 'name_collection';
                            console.log(`[stateMachine.ts] Turn ${i}: Slot confirmed but NAME MISSING. Routing to name_collection.`);
                        }
                        if (!state.requestedDate && state.pendingDate) state.requestedDate = state.pendingDate;
                        if (!state.requestedTime && state.pendingTime) state.requestedTime = state.pendingTime;
                    }
                }

                if (currentBotAsked === 'payment' || state.stage === 'payment_request' || state.stage === 'waiting_for_receipt') {
                    // Force logic lock: If we are paying, we stay in paying until done or manual reset
                    const isConfirmationText = normalizedContent.includes("pago") || normalizedContent.includes("comprobante") || normalizedContent.includes("listo") || normalizedContent.includes("enviado") || normalizedContent.includes("aca esta") || normalizedContent.includes("te mando") || normalizedContent.includes("ya esta") || normalizedContent.includes("adjunto") || normalizedContent.includes("transferi");
                    
                    if (hasMedia || isConfirmationText) {
                        state.stage = 'waiting_for_receipt';
                        console.log(`[stateMachine.ts] Turn ${i}: Detected receipt/confirmation. Transitioning stage definitively to waiting_for_receipt.`);
                    }
                }
            }
        }

        // --- Stale Date Check ---
        if (state.pendingDate) {
            const pDate = new Date(state.pendingDate + "T23:59:59Z");
            if (pDate < today) {
                state.pendingDate = null;
                state.pendingTime = null;
                state.stage = 'availability_proposal';
            }
        }

        // Final stage progression check - DEFENSIVE MODE (DB FIRST)
        if (state.selectedServiceIds.length > 0 && state.pendingCategoryIds.length === 0 && !state.currentCategoryId) {
            const isFinished = ['done', 'waiting_for_receipt', 'payment_request', 'cart_review', 'sub_service_selection', 'parent_selection'].includes(state.stage);
            if (isFinished) return state;

            // Priority: If user JUST provided a date/time, LOCK the stage to availability_proposal
            const hasJustScheduled = !!(state.requestedDate || state.requestedTime);
            if (hasJustScheduled) {
                state.stage = 'availability_proposal';
                console.log(`[stateMachine.ts] Stage Progression Override: Prioritizing Scheduling intent.`);
                return state;
            }

            // AUTO-PROGRESSION: Move to the first incomplete step
            if (!state.clientName || state.clientName === 'Cliente') {
                state.stage = 'name_collection';
            } else if (!state.clientPhone || state.clientPhone === 'Cliente' || state.clientPhone === 'null') {
                state.stage = 'phone_collection';
            } else if (!state.pendingDate || !state.pendingTime) {
                state.stage = 'availability_proposal';
            } else {
                // We have everything: Services, Name, Phone, and a Pending Slot
                // If it was already in availability_proposal, it means the user just confirmed.
                // If it was in some other stage (like cart_review), we assume they are ready for payment.
                state.stage = 'payment_request';
            }
        }
        
        // --- Continuity Recovery Logic (The "Anti-Amnesia" Filter) ---
        if (state.stage === 'greeting' && state.selectedServiceIds.length > 0) {
            let lastKnownStage: ConvState['stage'] | null = null;
            for (let k = messages.length - 1; k >= 0; k--) {
               const m = messages[k];
               if (m.role === 'assistant' || m.role === 'bot') {
                   const t = normalizeText(m.content);
                   if (t.includes("necesitamos una sena") || t.includes("alias") || t.includes("comprobante")) { lastKnownStage = 'payment_request'; break; }
                   if (t.includes("confirmar el turno") || t.includes("disponibilidad") || t.includes("te queda bien")) { lastKnownStage = 'availability_proposal'; break; }
                   if (t.includes("tu nombre") || t.includes("nombre completo")) { lastKnownStage = 'name_collection'; break; }
                   if (t.includes("tu carrito") || t.includes("revisemos tu pedido")) { lastKnownStage = 'cart_review'; break; }
                   if (t.includes("elige una categoria") || t.includes("nuestras categorias")) { lastKnownStage = 'parent_selection'; break; }
               }
            }
            if (lastKnownStage) {
                state.stage = lastKnownStage;
                console.log(`[stateMachine.ts] BACKTRACKING SUCCESS: Recovered stage ${lastKnownStage}`);
            }
        }

        // Final protection: if we reach payment_request but don't have date/time, something is wrong
        if (state.stage === 'payment_request' && (!state.pendingDate || !state.pendingTime)) {
            state.stage = 'availability_proposal';
            console.log(`[stateMachine.ts] Emergency Fallback: payment_request -> availability_proposal`);
        }

        // MANDATORY NAME ENFORCEMENT: Never go to payment without a name.
        if (['payment_request', 'waiting_for_receipt'].includes(state.stage) && (!state.clientName || state.clientName === 'Cliente')) {
            console.log(`[stateMachine.ts] Name Limbo Protection: Forcing name_collection before payment.`);
            state.stage = 'name_collection';
        }

        if (currentBotAsked) state.lastIntent = currentBotAsked;
    } catch (error) {
        console.error("[stateMachine.ts] CRITICAL ERROR in extractState:", error);
        // We keep the state as is to prevent complete reset, but mark a potential error if needed
    }

    console.log(`[stateMachine.ts] Final stage: ${state.stage}`);
    return state;
}

export function generateResponse(
    state: ConvState,
    categories: Category[],
    services: Service[],
    availableSlots: Slot[],
    isFromWhatsApp: boolean,
    hasMediaInLastMsg: boolean,
    isTimeAdjusted?: boolean,
    noStaffAvailable?: boolean
): { text: string, visualMenu?: { title: string, items: { label: string, price?: string | number }[] } } {
    console.log(`[stateMachine.ts] Generating response for stage: ${state.stage}. hasMediaInLastMsg: ${hasMediaInLastMsg}`);
    
    const response = (text: string, visualMenu?: any) => ({ text, visualMenu });
    
    const welcome = isFromWhatsApp 
        ? (state.clientName ? `¡Hola ${state.clientName.split(' ')[0]}! Qué lindo saludarte de nuevo. ` : "¡Hola! Qué lindo saludarte. ")
        : "";
    
    try {
        switch (state.stage) {
            case 'greeting': {
                if (!state.clientName || state.clientName === 'Cliente') {
                    return response(`Bienvenida a *KÂLON Estética* ✨\n\nSoy tu asistente virtual y estoy acá para ayudarte a reservar un momento especial para vos.\n\nPara empezar, ¿me decís tu *nombre y apellido*? 😊`);
                }
                const visualItems = categories.map(c => ({ id: c.id, label: c.name }));
                state.optionMap = Object.fromEntries(visualItems.map((v, i) => [(i + 1).toString(), v.id]));

                return response(
                    `${welcome}¡Qué lindo tenerte acá, *${state.clientName.split(' ')[0]}*! 💖\n\nContame, ¿qué servicios te interesan hoy?\n\n_He preparado un menú visual para vos 👇_`,
                    { title: 'Nuestras Categorías', items: visualItems }
                );
            }
            case 'parent_selection': {
                const visualItems = categories.map(c => ({ id: c.id, label: c.name }));
                state.optionMap = Object.fromEntries(visualItems.map((v, i) => [(i + 1).toString(), v.id]));

                let intro = state.errorType === 'ask_what_to_add' 
                    ? "¿De qué categoría te gustaría agregar otro servicio?" 
                    : "Decime de qué categoría te gustaría ver los servicios:";
                
                return response(
                    `${welcome}${intro}\n\n_Elegí una opción del menú 👇_`,
                    { title: 'Elige una Categoría', items: visualItems }
                );
            }
            case 'sub_service_selection': {
                const cat = categories.find(c => c.id === state.currentCategoryId);
                const subServices = services.filter(s => s.category_id === state.currentCategoryId);
                const visualItems = subServices.map(s => ({ id: s.id, label: s.title, price: formatPrice(s.price) }));
                state.optionMap = Object.fromEntries(visualItems.map((v, i) => [(i + 1).toString(), v.id]));

                let prefix = "";
                if (state.errorType === 'service_not_found') {
                    prefix = `Perdón, no encontré ese tratamiento. 😕 ¿Podrías elegir el número correcto?\n\n`;
                } else if (state.selectedServiceIds.length > 0) {
                    prefix = `¡Qué buena elección! Ya te sumé lo anterior. 💖 Ahora de *${cat?.name}*, ¿cuál te gustaría?\n\n`;
                } else {
                    prefix = `¡Excelente! Estos son los tratamientos de *${cat?.name}*:\n\n`;
                }
                
                return response(
                    `${prefix}_Elegí una opción del menú 👇_`,
                    { title: `Servicios de ${cat?.name || 'Kalon'}`, items: visualItems }
                );
            }
            case 'cart_review': {
                const selectedServices = state.selectedServiceIds.map(id => services.find(s => s.id === id)).filter(Boolean) as Service[];
                const list = selectedServices.map(s => {
                    const cleanDur = s.duration.toString().replace(/min/g, '').trim();
                    return `  ✅ *${s.title}*  —  $${formatPrice(s.price)}  ·  ${cleanDur} min`;
                }).join('\n');
                
                const totalPrice = selectedServices.reduce((acc, s) => acc + Math.round(Number(s.price)), 0);
                const totalDur = selectedServices.reduce((acc, s) => acc + parseDuration(s.duration), 0);
                const durText = formatDurationHuman(totalDur);

                if (state.errorType === 'ask_what_to_remove') {
                    return response(`📝 *Tu carrito actual:*\n\n${list}\n\n¿Qué servicio puntual de la lista te gustaría eliminar?`);
                }
                
                if (state.errorType === 'ask_what_to_modify') {
                    return response(`📝 *Tu carrito actual:*\n\n${list}\n\n¿Qué servicio te gustaría modificar y por cuál?`);
                }

                if (state.errorType === 'unrecognized_cart_action') {
                    return response(`Perdón, no te entendí del todo. 🧐 ¿Te gustaría confirmar este pedido, o preferís agregar / modificar algo?\n\n*Resumen actual:*\n${list}\n\n💰 *Total:* $${formatPrice(totalPrice)}`);
                }

                return response(`¡Excelente! 🎉 Revisemos tu pedido para que esté todo perfecto:\n\n${list}\n\n💰 *Total:* $${formatPrice(totalPrice)}\n⏳ *Duración estimada:* ${durText}\n\n¿Es correcto o te gustaría agregar o modificar algo?`);
            }
            case 'cart_confirmation': {
                 const selectedNames = services.filter(s => state.selectedServiceIds.includes(s.id)).map(s => s.title).join(', ');
                 return response(`¡Qué lindo lo que elegiste! 😍 Actualmente tenés en tu carrito: *${selectedNames}*.\n\n¿Te gustaría sumar algo más o ya buscamos un lugarcito en nuestra agenda para vos?`);
            }
            case 'name_collection': {
                const selectedServices = services.filter(s => state.selectedServiceIds.includes(s.id));
                const totalPrice = selectedServices.reduce((acc, s) => acc + Math.round(Number(s.price)), 0);
                const totalDur = selectedServices.reduce((acc, s) => acc + parseDuration(s.duration), 0);
                const durText = formatDurationHuman(totalDur);

                if (state.pendingDate && state.pendingTime) {
                    return response(`¡Perfecto! Ya reservé el lugar para vos. 😍 Para ultimar los detalles y guardarlo definitivamente a tu nombre, ¿cómo es tu nombre completo? 😊`);
                }
                
                return response(`¡Perfecto! Todo confirmado. ✨ Entonces, el total es de *$${formatPrice(totalPrice)}* por una sesión de *${durText}*.\n\nPara ir agendándote, ¿cómo es tu nombre completo? 😊`);
            }
            case 'phone_collection': {
                const greeting = `¡Un gusto conocerte, *${state.clientName}*! 😊 `;
                if (isFromWhatsApp) {
                    return response(`${greeting}¿Te registro con este mismo número de WhatsApp o preferís usar otro para los recordatorios?`);
                }
                return response(`${greeting}Por favor, decime tu número de WhatsApp así te mando el comprobante de reserva y no te olvidás de nada. 📱`);
            }
            case 'availability_proposal': {
                if (availableSlots.length > 0) {
                    const selectedSvc = state.selectedServiceIds.map(id => services.find(s => s.id === id)).filter(Boolean) as Service[];
                    const totalDur = selectedSvc.reduce((acc, s) => acc + parseDuration(s.duration), 0);
                    const durText = formatDurationHuman(totalDur);
                    const serviceList = selectedSvc.map(s => s.title).join(' + ');
                    
                    if (availableSlots.length === 1) {
                        const slot = availableSlots[0];
                        const greeting = state.clientName ? `${state.clientName.split(' ')[0]}, ¡qué alegría! ✨ ` : "¡Excelentes noticias! ✨ ";
                        
                        const adjustmentNote = isTimeAdjusted 
                            ? (state.requestedDate && slot.date !== state.requestedDate 
                                ? `No tengo disponibilidad para el ${formatDateHuman(state.requestedDate)}, pero busqué el hueco más próximo disponible: ` 
                                : "Como tu sesión es larga y cerramos a las 20hs, te busqué el horario más cercano disponible en el día: ") 
                            : "";

                        return response(`${greeting}${adjustmentNote}Tengo disponibilidad para tu sesión de *${serviceList}* (Duración: *${durText}*) el día *${formatDateHuman(slot.date)}* a las *${slot.time}hs*. 🗓️\n\n¿Te queda bien este horario o preferís que busquemos otro?`);
                    } else {
                        const options = availableSlots.map(s => `📅 *${formatDateHuman(s.date)}* a las *${s.time}hs*`).join('\n');
                        const adjustmentNote2 = isTimeAdjusted ? "No encontré exactamente lo que buscabas, pero aquí tenés las mejores alternativas cercanas:\n\n" : "";
                        return response(`¡Claro que sí! 😊 ${adjustmentNote2}Para que elijas con tranquilidad, aquí tenés las opciones más cercanas para tu sesión de *${serviceList}*:\n\n${options}\n\n¿Cuál de estos horarios te resulta más cómodo?`);
                    }
                }
                if (noStaffAvailable) {
                    return response("Uy, por el momento no tenemos turnos disponibles para esta categoría. 🗓️ Estamos trabajando para ampliar el equipo y abrir nuevas vacantes pronto. ¡Disculpas! 😊");
                }
                return response("Uy, parece que tengo la agenda completa para esa duración esta semana. 🗓️ ¿Te gustaría que busquemos un lugar para la semana que viene así te aseguro un espacio para vos? 😊");
            }
            case 'payment_request': {
                const selectedSvc = state.selectedServiceIds.map(id => services.find(s => s.id === id)).filter(Boolean) as Service[];
                const totalPrice = selectedSvc.reduce((acc, s) => acc + Math.round(Number(s.price)), 0);
                const totalDur = selectedSvc.reduce((acc, s) => acc + parseDuration(s.duration), 0);
                const serviceList = selectedSvc.map(s => s.title).join(' + ');
                const deposit = totalPrice * 0.5;
                const durText = formatDurationHuman(totalDur);
                const personalGreeting = state.clientName ? `¡Todo listo, *${state.clientName.split(' ')[0]}*! ✨ ` : "¡Excelente elección! ✨ ";

                const webNote = !isFromWhatsApp ? "\n\nPodés subir el comprobante haciendo clic en el 📎 aquí abajo. ¡Yo lo voy a recibir! 📸" : "";
                const mainMsg = `${personalGreeting}Tu sesión de *${serviceList}* durará aproximadamente *${durText}* y el valor total es de *$${formatPrice(totalPrice)}*.\n\nPara confirmar definitivamente tu lugar el día *${formatDateHuman(state.pendingDate || '')}* a las *${state.pendingTime || '(por confirmar)'}hs*, necesitamos una seña del 50% (*$${formatPrice(deposit)}*).\n\nTransferí al alias: *KALON.ESTETICA.OK* y enviame el comprobante por aquí. ¡Ya casi estamos! 📸`;
                
                return response(`${mainMsg}${webNote}`);
            }
            case 'waiting_for_receipt': {
                const note = !isFromWhatsApp ? " Recordá que podés subirlo con el clip de abajo o mandarlo por WhatsApp. 📸" : "";
                return response(`Quedo atenta a tu comprobante de transferencia para terminar de confirmar tu turno.${note} ¡Cualquier duda decime! 😊`);
            }
            default:
                return response("¡Hola! ¿En qué más puedo ayudarte hoy para que te sientas radiante? ✨");
        }
    } catch (error) {
        console.error("[stateMachine.ts] Error in generateResponse:", error);
        return response("Hubo un pequeño error procesando tu solicitud, ¿podrías repetirlo? 😊");
    }
}
