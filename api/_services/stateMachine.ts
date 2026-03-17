
import { 
    normalizeText, 
    getSimilarity, 
    extractName, 
    formatDateHuman, 
    formatDurationHuman, 
    parseDuration, 
    parseRelativeDate 
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
    errorType?: 'service_not_found' | 'category_not_found' | 'unrecognized_cart_action';
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
    const now = new Date();
    let resetCause: string | null = null;
    
    if (initialState) {
        // 1. Reset by time (12h amnesia check) - Priority #1
        if (lastUpdatedAt) {
            const lastUpdate = new Date(lastUpdatedAt);
            if (now.getTime() - lastUpdate.getTime() > TWELVE_HOURS) {
                resetCause = 'timeout';
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

            if (isNewBookingIntent || mentionsCategory) {
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
    
    const state: ConvState = (initialState && !resetCause) ? { ...initialState } : {
        clientName: initialState?.clientName || (initialName && initialName !== 'Cliente' ? initialName : null),
        clientPhone: initialState?.clientPhone || initialPhone || null,
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
        isBotEnabled: initialState ? initialState.isBotEnabled : defaultIsBotEnabled
    };

    // Clear previous errors
    delete state.errorType;

    // ANTI-AMNESIA LOGIC: Conversational Rebuild
    // If we have an initialState and it's NOT a greeting, we only process the LATEST message (Performance).
    // IF the state is lost (greeting/null) OR it's a reset, we process the FULL HISTORY to reconstruct context.
    const isStateLost = (state.stage === 'greeting' && state.selectedServiceIds.length === 0);
    const messagesToProcess = (isStateLost && messages.length > 1) ? messages : (messages.length > 0 ? [messages[messages.length - 1]] : []);
    
    if (isStateLost && messages.length > 1) {
        console.log(`[stateMachine.ts] AMNESIA DETECTED. Reconstructing state from ${messages.length} messages...`);
    }

    try {
        const today = new Date(); 
        today.setHours(0,0,0,0);

        if (messagesToProcess.length === 0) return state;

        let currentBotAsked: string | null = null;
        const nlp = await getNlpManager();

        // 1. Scan history for bot context (What did the bot just ask?)
        const lastBotMsg = [...messages].reverse().find(m => m.role === 'assistant' || m.role === 'bot');
        if (lastBotMsg) {
            const botText = normalizeText(lastBotMsg.content);
            if (botText.includes("elige una categoria") || botText.includes("nuestras categorias")) currentBotAsked = 'category';
            else if (botText.includes("servicios de") || botText.includes("tratamientos de") || botText.includes("estos son los tratamientos")) currentBotAsked = 'sub_service';
            else if (botText.includes("revisemos tu pedido") || botText.includes("tu carrito") || botText.includes("listado de todos")) currentBotAsked = 'cart_review';
            else if (botText.includes("agregar algo mas") || botText.includes("avanzamos con el turno")) currentBotAsked = 'cart_confirmation';
            else if (botText.includes("tu nombre") || botText.includes("nombre completo") || botText.includes("con quien tengo")) currentBotAsked = 'name';
            else if (botText.includes("whatsapp") || botText.includes("este mismo numero") || botText.includes("numero de cel")) currentBotAsked = 'phone';
            else if (
                botText.includes("proximo horario") || botText.includes("disponibilidad") || botText.includes("te queda bien") || 
                botText.includes("busquemos otro") || botText.includes("horario me queda") || botText.includes("te sirve este horario") || 
                botText.includes("podemos agendar") || botText.includes("para el dia") || botText.includes("buenas noticias") || 
                botText.includes("elegir tranquila") || botText.includes("opciones mas cercanas")
            ) {
                currentBotAsked = 'availability';
            }
            else if (botText.includes("necesitamos una seña") || botText.includes("transferi al alias") || botText.includes("comprobante por aca") || botText.includes("senar") || botText.includes("pago de la reserva")) {
                currentBotAsked = 'payment';
                state.stage = 'payment_request';
            }
        }

        for (let i = 0; i < messagesToProcess.length; i++) {
            const msg = messagesToProcess[i];
            if (!msg.content && !msg.media_url && !msg.media_data) continue;
            const normalizedContent = normalizeText(msg.content || "");

            // Skip bot messages in processing loop (already handled context)
            if (msg.role === 'assistant' || msg.role === 'bot') continue;


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
                    const isAlreadyBooking = ['phone_collection', 'availability_proposal', 'payment_request', 'waiting_for_receipt'].includes(state.stage);

                    // If we have services OR a date, we are NO LONGER in the greeting phase
                    if (state.stage === 'greeting' && !hasSelectedServices) {
                        state.stage = 'parent_selection';
                    } else if (isAlreadyBooking || hasSelectedServices) {
                        console.log(`[stateMachine.ts] Turn ${i}: Protecting booking flow (Stage: ${state.stage}) from reset by intent ${intent}`);
                        // Don't reset stage. If it was category selection, maybe move to parent_selection if they really want lists
                        if (intent === 'listar_servicios' && state.stage === 'sub_service_selection') {
                            state.stage = 'parent_selection';
                        }
                    } else if (state.stage === 'sub_service_selection') {
                         // Keep it there or move if requested
                    } else {
                         state.stage = 'parent_selection';
                    }
                }

                // --- Relative Date & Time Detection ---
                const relDate = parseRelativeDate(msg.content, today);
                const timeMatch = msg.content.match(/(\d{1,2})(:|\s?hs?|y\s)(\d{2})?/i);
                
                if (relDate || timeMatch) {
                    if (relDate) state.requestedDate = relDate;
                    if (timeMatch) {
                        let h = parseInt(timeMatch[1]);
                        const m = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
                        if (h < 9) h += 12;
                        state.requestedTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                    }
                    state.pendingDate = null;
                    state.pendingTime = null;
                    state.stage = 'availability_proposal';
                    console.log(`[stateMachine.ts] Transition to availability_proposal due to date detection`);
                }

                // --- Multi-Category Detection ---
                const catsInFoundOrder = categories
                    .filter(c => normalizedContent.includes(normalizeText(c.name)))
                    .map(c => ({ id: c.id, name: c.name, pos: normalizedContent.indexOf(normalizeText(c.name)) }))
                    .sort((a, b) => a.pos - b.pos);
                
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
                                    state.clientName = cleanName;
                                    console.log(`[stateMachine.ts] Turn ${i}: Detected name: ${state.clientName}`);
                                    
                                    // --- Loop Prevention: Advance stage if we just got the name ---
                                    if (!state.clientPhone) state.stage = 'phone_collection';
                                    else if (!state.pendingDate) state.stage = 'availability_proposal';
                                    else state.stage = 'payment_request';
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

                    if (!isOnlyNamingCategories) {
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
                                if (!normalizedContent.includes(nt) && score < 40) score = 0; // Global must be strong match
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
                                if (!state.selectedServiceIds.includes(fs.id)) state.selectedServiceIds.push(fs.id);
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
                    const isRemoval = normalizedContent.includes("quitar") || normalizedContent.includes("sacar") || normalizedContent.includes("eliminar") || normalizedContent.includes("borrar") || normalizedContent.includes("menos") || normalizedContent.includes("saca");
                    
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
                            state.selectedServiceIds = state.selectedServiceIds.filter(sid => !toRemove.includes(sid));
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
                            const keyWords = sn.filter(w => w.length > 3 && !["masaje", "limpieza", "pestaña", "uña"].some(g => w.includes(g)));
                            return keyWords.some(kw => inputWords.includes(kw));
                        });

                        const newSvcsToAdd = matchedSvcs.filter(s => !state.selectedServiceIds.includes(s.id));

                        // --- 3. EXECUTION ORDER AND STATE TRANSITION (STRICT PRIORITY) ---
                        const isExplicitAdd = normalizedContent.includes("agregar") || normalizedContent.includes("sumar") || normalizedContent.includes("mas") || intent === 'afirmacion_o_agregar_carrito';

                        if (isExplicitAdd && newSvcsToAdd.length === 0) {
                            // If they say "agregar" but don't specify a service, go to categories
                            state.stage = 'parent_selection';
                            state.currentCategoryId = null;
                            state.errorType = undefined;
                        } else if (newSvcsToAdd.length > 0) {
                            newSvcsToAdd.forEach(fs => {
                                if (!state.selectedServiceIds.includes(fs.id)) state.selectedServiceIds.push(fs.id);
                            });
                            state.stage = 'cart_review';
                            state.errorType = undefined;
                        } else if (isUserConfirming) {
                            state.stage = 'name_collection';
                            state.errorType = undefined;
                        } else if (intent === 'negacion_o_cerrar_carrito' || normalizedContent.includes("modificar") || normalizedContent.includes("no")) {
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
                        (normalizedContent.includes("turno") && (normalizedContent.includes("ese") || normalizedContent.includes("esta")))
                    ) {
                        state.stage = 'payment_request';
                        console.log(`[stateMachine.ts] Turn ${i}: Transition to payment_request (Availability confirmed)`);
                        if (!state.requestedDate && state.pendingDate) state.requestedDate = state.pendingDate;
                        if (!state.requestedTime && state.pendingTime) state.requestedTime = state.pendingTime;
                    }
                }

                if (currentBotAsked === 'payment' || state.stage === 'payment_request' || state.stage === 'waiting_for_receipt') {
                    const isConfirmationText = normalizedContent.includes("pago") || normalizedContent.includes("comprobante") || normalizedContent.includes("listo") || normalizedContent.includes("enviado") || normalizedContent.includes("aca esta") || normalizedContent.includes("te mando") || normalizedContent.includes("ya esta");
                    if (hasMedia || isConfirmationText) {
                        state.stage = 'waiting_for_receipt';
                        console.log(`[stateMachine.ts] Turn ${i}: Detected receipt/confirmation. Transitioning stage definitively to waiting_for_receipt.`);
                    }
                }

                if (hasMedia && state.pendingDate && state.pendingTime && state.selectedServiceIds.length > 0) {
                     state.stage = 'waiting_for_receipt';
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

        // Final stage progression check - DEFENSIVE MODE
        if (state.selectedServiceIds.length > 0 && state.pendingCategoryIds.length === 0 && !state.currentCategoryId) {
            const isInteracting = ['parent_selection', 'sub_service_selection', 'cart_review', 'cart_confirmation', 'name_collection', 'phone_collection', 'availability_proposal'].includes(state.stage);
            const isFinished = ['done', 'waiting_for_receipt', 'payment_request'].includes(state.stage);
            
            // Priority: If user JUST provided a date/time, LOCK the stage to availability_proposal
            const hasJustScheduled = !!(state.requestedDate || state.requestedTime);

            if (!isInteracting && !isFinished && !hasJustScheduled) {
                if (!state.clientName || state.clientName === 'Cliente') {
                    state.stage = 'name_collection';
                    console.log(`[stateMachine.ts] Progression: name_collection`);
                } else if (!state.clientPhone || state.clientPhone === 'Cliente') {
                    state.stage = 'phone_collection';
                    console.log(`[stateMachine.ts] Progression: phone_collection`);
                } else if (!state.pendingDate || !state.pendingTime) {
                    state.stage = 'availability_proposal';
                    console.log(`[stateMachine.ts] Progression: availability_proposal`);
                } else {
                    state.stage = 'payment_request';
                    console.log(`[stateMachine.ts] Progression: payment_request (Failsafe)`);
                }
            }
        }
        
        // --- Continuity Recovery Logic (The "Anti-Amnesia" Filter) ---
        if (state.stage === 'greeting' && state.selectedServiceIds.length > 0) {
            let lastKnownStage: ConvState['stage'] | null = null;
            for (let k = messages.length - 1; k >= 0; k--) {
               const m = messages[k];
               if (m.role === 'assistant' || m.role === 'bot') {
                   const t = normalizeText(m.content);
                   if (t.includes("necesitamos una seña") || t.includes("alias") || t.includes("comprobante")) { lastKnownStage = 'payment_request'; break; }
                   if (t.includes("confirmar el turno") || t.includes("disponibilidad") || t.includes("te queda bien")) { lastKnownStage = 'availability_proposal'; break; }
                   if (t.includes("tu nombre") || t.includes("nombre completo")) { lastKnownStage = 'name_collection'; break; }
                   if (t.includes("tu carrito") || t.includes("revisemos tu pedido")) { lastKnownStage = 'cart_review'; break; }
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
    hasMediaInLastMsg: boolean
): string {
    console.log(`[stateMachine.ts] Generating response for stage: ${state.stage}. hasMediaInLastMsg: ${hasMediaInLastMsg}`);
    
    // 1. TERMINAL CONFIRMATION & COURTESY (Top priority)
    if (state.stage === 'done' || (state.stage === 'waiting_for_receipt' && hasMediaInLastMsg)) {
        if (state.lastIntent === 'courtesy_ack') {
            const name = state.clientName ? state.clientName.split(' ')[0] : '';
            return `¡De nada${name ? `, ${name}` : ''}! Te esperamos. ✨`;
        }
        return "¡Excelente noticia! 💖 Recibimos tu comprobante correctamente. Tu turno ya quedó agendado y confirmado en nuestro sistema. ¡Qué placer va a ser recibirte en KÂLON para mimarte un rato! Nos vemos pronto. ✨";
    }

    const welcome = isFromWhatsApp 
        ? (state.clientName ? `¡Hola ${state.clientName.split(' ')[0]}! Qué lindo saludarte de nuevo. ` : "¡Hola! Qué lindo saludarte. ")
        : "";
    
    const isNew = state.selectedServiceIds.length === 0 && !state.currentCategoryId;

    try {
        switch (state.stage) {
            case 'greeting':
            case 'parent_selection': {
                const list = categories.map(c => `• *${c.name}*`).join('\n');
                const intro = isNew 
                    ? "Bienvenida a *KÂLON Estética* ✨. Soy tu asistente virtual y estoy acá para ayudarte a reservar un momento para vos. Contame, ¿qué servicios te interesan hoy?"
                    : "Decime de qué categoría te gustaría ver los servicios hoy para seguir:";
                
                return `${welcome}${intro}\n\n${list}\n\nEscribí el nombre de la categoría para ver los tratamientos.`;
            }
            case 'sub_service_selection': {
                const cat = categories.find(c => c.id === state.currentCategoryId);
                const subServices = services.filter(s => s.category_id === state.currentCategoryId);
                
                // Agrupamos servicios por "raíz" si tienen un guion o prefijo común (ej: "Nail Art")
                const list = subServices.map(s => {
                    const cleanDur = s.duration.toString().replace(/min/gi, '').replace(/minutos/gi, '').trim();
                    const title = s.title;
                    
                    // Lógica de identación: Si tiene guion o es Nail Art y hay un prefijo común
                    const isSub = title.includes('-') || title.toLowerCase().includes('nail art');
                    const displayTitle = isSub ? title : `*${title}*`;
                    const item = `${displayTitle} ($${s.price}) - ${cleanDur} min`;
                    
                    if (isSub) {
                        return `  - ${item}`;
                    } else {
                        return `• ${item}`;
                    }
                }).join('\n');
                
                const selectedCount = state.selectedServiceIds.length;
                let prefix = "";
                
                if (state.errorType === 'service_not_found') {
                    prefix = `Perdón, no encontré ese tratamiento. 😕 ¿Podrías escribir el nombre (o una parte) tal como aparece en la lista para que pueda sumarlo?\n\nRevisemos de nuevo los servicios de *${cat?.name}*:\n\n`;
                } else if (selectedCount > 0) {
                    prefix = `¡Qué buena elección! Ya te sumé lo anterior. 💖 Ahora contame, de *${cat?.name}*, ¿cuál te gustaría realizarte?\n\n`;
                } else if (state.pendingCategoryIds.length > 0) {
                    prefix = `¡Perfecto! Vamos por partes. Primero contame de *${cat?.name}*, ¿cuál te gustaría? (Después vemos las otras categorías que pediste) 😊\n\n`;
                } else {
                    prefix = `¡Excelente! Estos son los tratamientos que tenemos en *${cat?.name}*. ¿Cuál te gustaría realizarte?\n\n`;
                }
                
                return `${prefix}${list}\n\nSolo escribí el nombre del tratamiento y lo agrego a tu plan.`;
            }
            case 'cart_review': {
                const selectedServices = services.filter(s => state.selectedServiceIds.includes(s.id));
                const list = selectedServices.map(s => {
                    const cleanDur = s.duration.toString().replace(/min/g, '').trim();
                    const isSub = s.title.includes('-') || s.title.toLowerCase().includes('nail art');
                    const item = `• *${s.title}* (@price) - ${cleanDur} min`.replace('@price', `$${Math.round(Number(s.price))}`);
                    return isSub ? `  - ${item}` : item;
                }).join('\n');
                
                const totalPrice = selectedServices.reduce((acc, s) => acc + Math.round(Number(s.price)), 0);
                const totalDur = selectedServices.reduce((acc, s) => acc + parseDuration(s.duration), 0);
                const durText = formatDurationHuman(totalDur);

                if (state.errorType === 'unrecognized_cart_action') {
                    return `Perdón, no te entendí del todo. 🧐 ¿Te gustaría confirmar este pedido, o preferís agregar / modificar algo?\n\n*Resumen actual:*\n${list}\n💰 *Total:* $${totalPrice}`;
                }

                return `¡Excelente! 🎉 Revisemos tu pedido para que esté todo perfecto:\n\n${list}\n\n💰 *Total:* $${totalPrice}\n⏳ *Duración estimada:* ${durText}\n\n¿Es correcto o te gustaría agregar o modificar algo?`;
            }
            case 'cart_confirmation': {
                 const selectedNames = services.filter(s => state.selectedServiceIds.includes(s.id)).map(s => s.title).join(', ');
                 return `¡Qué lindo lo que elegiste! 😍 Actualmente tenés en tu carrito: *${selectedNames}*.\n\n¿Te gustaría sumar algo más o ya buscamos un lugarcito en nuestra agenda para vos?`;
            }
            case 'name_collection': {
                const selectedServices = services.filter(s => state.selectedServiceIds.includes(s.id));
                const totalPrice = selectedServices.reduce((acc, s) => acc + Math.round(Number(s.price)), 0);
                const totalDur = selectedServices.reduce((acc, s) => acc + parseDuration(s.duration), 0);
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
                    const selectedSvc = services.filter(s => state.selectedServiceIds.includes(s.id));
                    const totalDur = selectedSvc.reduce((acc, s) => acc + parseDuration(s.duration), 0);
                    const durText = formatDurationHuman(totalDur);
                    const serviceList = selectedSvc.map(s => s.title).join(' + ');
                    
                    if (availableSlots.length === 1) {
                        const slot = availableSlots[0];
                        const greeting = state.clientName ? `${state.clientName.split(' ')[0]}, ¡qué alegría! ✨ ` : "¡Excelentes noticias! ✨ ";
                        return `${greeting}Tengo disponibilidad para tu sesión de *${serviceList}* (Duración: *${durText}*) el día *${formatDateHuman(slot.date)}* a las *${slot.time}hs*. 🗓️\n\n¿Te queda bien este horario o preferís que busquemos otro?`;
                    } else {
                        const options = availableSlots.map(s => `• *${formatDateHuman(s.date)}* a las *${s.time}hs*`).join('\n');
                        return `¡Claro que sí! 😊 Para que elijas con tranquilidad, aquí tenés las opciones más cercanas para tu sesión de *${serviceList}*:\n\n${options}\n\n¿Cuál de estos horarios te resulta más cómodo?`;
                    }
                }
                return "Uy, parece que tengo la agenda completa para esa duración esta semana. 🗓️ ¿Te gustaría que busquemos un lugar para la semana que viene así te aseguro un espacio para vos? 😊";
            }
            case 'payment_request': {
                const selectedSvc = services.filter(s => state.selectedServiceIds.includes(s.id));
                const totalPrice = selectedSvc.reduce((a, b) => a + Number(b.price), 0);
                const totalDur = selectedSvc.reduce((a, b) => a + parseDuration(b.duration), 0);
                const serviceList = selectedSvc.map(s => s.title).join(' + ');
                const deposit = totalPrice * 0.5;
                const durText = formatDurationHuman(totalDur);
                const personalGreeting = state.clientName ? `¡Todo listo, *${state.clientName.split(' ')[0]}*! ✨ ` : "¡Excelente elección! ✨ ";

                const webNote = !isFromWhatsApp ? "\n\nPodés subir el comprobante haciendo clic en el clip aquí abajo, o si te queda más cómodo, simplemente envíame la foto por WhatsApp. ¡Yo lo voy a recibir igual! 📸" : "";
                const mainMsg = `${personalGreeting}Tu sesión de *${serviceList}* durará aproximadamente *${durText}* y el valor total es de *$${totalPrice}*.\n\nPara confirmar definitivamente tu lugar el día *${formatDateHuman(state.pendingDate || '')}* a las *${state.pendingTime}hs*, necesitamos una seña del 50% (*$${deposit.toFixed(0)}*).\n\nTransferí al alias: *KALON.ESTETICA.OK* y enviame el comprobante por aquí. ¡Ya casi estamos! 📸`;
                
                return `${mainMsg}${webNote}`;
            }
            case 'waiting_for_receipt': {
                const note = !isFromWhatsApp ? " Recordá que podés subirlo con el clip de abajo o mandarlo por WhatsApp. 📸" : "";
                return `Quedo atenta a tu comprobante de transferencia para terminar de confirmar tu turno.${note} ¡Cualquier duda decime! 😊`;
            }
            default:
                return "¡Hola! ¿En qué más puedo ayudarte hoy para que te sientas radiante? ✨";
        }
    } catch (error) {
        console.error("[stateMachine.ts] Error in generateResponse:", error);
        return "Hubo un pequeño error procesando tu solicitud, ¿podrías repetirlo? 😊";
    }
}
