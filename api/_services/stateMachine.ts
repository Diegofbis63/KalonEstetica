
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
    initialPhone: string | null = null
): Promise<ConvState> {
    console.log(`[stateMachine.ts] Extracting state. InitialName: ${initialName}, InitialPhone: ${initialPhone}`);
    
    const state: ConvState = {
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

    try {
        const today = new Date(); 
        today.setHours(0,0,0,0);

        if (messages.length === 0) return state;

        let currentBotAsked: string | null = null;
        const nlp = await getNlpManager();

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (!msg.content && !msg.media_url && !msg.media_data) continue;
            const normalizedContent = normalizeText(msg.content || "");

            if (msg.role === 'assistant' || msg.role === 'bot') {
                const botText = normalizeText(msg.content);
                if (botText.includes("elige una categoria") || botText.includes("nuestras categorias")) currentBotAsked = 'category';
                else if (botText.includes("servicios de") || botText.includes("tratamientos de") || botText.includes("estos son los tratamientos")) currentBotAsked = 'sub_service';
                else if (botText.includes("revisemos tu pedido") || botText.includes("tu carrito") || botText.includes("listado de todos")) currentBotAsked = 'cart_review';
                else if (botText.includes("agregar algo mas") || botText.includes("avanzamos con el turno")) currentBotAsked = 'cart_confirmation';
                else if (botText.includes("tu nombre") || botText.includes("nombre completo") || botText.includes("con quien tengo")) currentBotAsked = 'name';
                else if (botText.includes("whatsapp") || botText.includes("este mismo numero") || botText.includes("numero de cel")) currentBotAsked = 'phone';
                else if (
                    botText.includes("proximo horario") || 
                    botText.includes("disponibilidad") || 
                    botText.includes("te queda bien") || 
                    botText.includes("busquemos otro") || 
                    botText.includes("horario me queda") || 
                    botText.includes("te sirve este horario") || 
                    botText.includes("podemos agendar") || 
                    botText.includes("para el dia") ||
                    botText.includes("buenas noticias") ||
                    botText.includes("elegir tranquila") ||
                    botText.includes("opciones mas cercanas")
                ) {
                    currentBotAsked = 'availability';
                    const isoMatch = msg.content.match(/(\d{4})-(\d{2})-(\d{2})/);
                    if (isoMatch) state.pendingDate = isoMatch[0];
                    else {
                        const months: Record<string, string> = {
                            "enero": "01", "febrero": "02", "marzo": "03", "abril": "04", "mayo": "05", "junio": "06",
                            "julio": "07", "agosto": "08", "septiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12"
                        };
                        const humanMatch = msg.content.match(/(\d{1,2})\s+(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\s+(\d{4})/i);
                        if (humanMatch) {
                            state.pendingDate = `${humanMatch[3]}-${months[humanMatch[2].toLowerCase()]}-${humanMatch[1].padStart(2, '0')}`;
                        }
                    }
                    const timeMatch = msg.content.match(/(\d{1,2}):(\d{2})/);
                    if (timeMatch) state.pendingTime = timeMatch[0].padStart(5, '0');
                }
                else if (botText.includes("necesitamos una seña") || botText.includes("transferi al alias") || botText.includes("comprobante por aca") || botText.includes("senar") || botText.includes("pago de la reserva")) {
                    currentBotAsked = 'payment';
                    state.stage = 'payment_request';
                }
                
                services.forEach(s => {
                    const normalizedTitle = normalizeText(s.title);
                    // Captures services from confirmation messages, itemized lists, or totals
                    const isRecap = botText.includes("revisemos") || botText.includes("pedido") || botText.includes("total") || botText.includes("sesion va a durar") || botText.includes("resumen") || botText.includes("confirmado");
                    const isConfirmation = botText.includes("agregue") || botText.includes("seleccionaste") || botText.includes("sume") || botText.includes("ya te sume") || botText.includes("que buena eleccion");
                    
                    if (botText.includes(normalizedTitle) && (isConfirmation || isRecap)) {
                        if (!state.selectedServiceIds.includes(s.id)) state.selectedServiceIds.push(s.id);
                    }
                });
                continue;
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

                if (!state.clientName) {
                    const isNamePrompt = currentBotAsked === 'name' || state.stage === 'name_collection';
                    const hasIntro = normalizedContent.includes("mi nombre es") || normalizedContent.includes("soy ");
                    
                    if (isNamePrompt || hasIntro) {
                        if (msg.content.length > 2 && msg.content.length < 40) {
                            const notNames = ["si", "no", "hola", "chau", "nada", "turno", "bien", "dale", "otro", "extensiones", "pestañas", "uñas", "cejas", "lifting", "facial", "masaje"];
                            const containsServiceWord = notNames.some(word => normalizedContent.includes(word));
                            
                            if (!containsServiceWord || hasIntro) {
                                state.clientName = extractName(msg.content);
                                console.log(`[stateMachine.ts] Detected name: ${state.clientName}`);
                                // --- Loop Prevention: Advance stage if we just got the name ---
                                if (state.clientName && state.clientName.length > 2) {
                                    if (!state.clientPhone) state.stage = 'phone_collection';
                                    else if (!state.pendingDate) state.stage = 'availability_proposal';
                                    else state.stage = 'payment_request';
                                }
                            }
                        }
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
                
                if (currentBotAsked === 'sub_service' || state.stage === 'sub_service_selection') {
                    // Detect if the user is AGAIN naming categories they already requested
                    // or if they are naming NEW categories.
                    const isNewCategoryRequest = catsInFoundOrder.some(c => !state.selectedServiceIds.some(sid => services.find(s => s.id === sid)?.category_id === c.id) && state.currentCategoryId !== c.id);
                    const isOnlyNamingCategories = isNewCategoryRequest && normalizedContent.length < (catsInFoundOrder.reduce((acc, c) => acc + c.name.length, 0) + 12);

                    if (!isOnlyNamingCategories) {
                        const inputParts = normalizedContent.split(/[\s,y+]+/).filter(p => p.length >= 3);
                        let potentialSvcs = services.filter(s => {
                            // Logic: Match if same category OR if user mentions the specific service title globally
                            if (state.currentCategoryId && s.category_id !== state.currentCategoryId) {
                                // Only allow global match if the full title is explicitly mentioned
                                return normalizedContent.includes(normalizeText(s.title));
                            }
                            
                            const nt = normalizeText(s.title);
                            // 1. EXACT PHRASE MATCH
                            if (normalizedContent.includes(nt)) return true;
                            
                            // 2. Exact word match for core identifying words
                            const inputWords = normalizedContent.split(/[\s,y+]+/).filter(p => p.length >= 3);
                            const titleWords = nt.split(/\s+/).filter(w => w.length > 3);
                            
                            const matchesCoreWord = titleWords.some(tw => inputWords.includes(tw));
                            if (matchesCoreWord) {
                                // If it's a category name, ignore it as a service match (e.g. user said "cejas" to see the list)
                                const isCategoryName = categories.some(cat => normalizeText(cat.name) === normalizedContent);
                                if (isCategoryName) return false;

                                // Permissive matching for core words: if they type "laminado" and it's in the title, it's a match
                                // unless it's way too short or generic. 
                                if (normalizedContent.length > 5 || normalizedContent === nt || getSimilarity(normalizedContent, nt) > 0.6) return true;
                            }

                            return false;
                        });

                        // Refined Differentiation: If multiple services found, we need to be EXTRA strict
                        if (potentialSvcs.length > 1) {
                            // 1. Try to find an exact full-title match in the text
                            const exactMatches = potentialSvcs.filter(s => normalizedContent.includes(normalizeText(s.title)));
                            if (exactMatches.length === 1) {
                                potentialSvcs = exactMatches;
                            } else {
                                // 2. Try identifying keywords (specific unique words for the service)
                                potentialSvcs = potentialSvcs.filter(s => {
                                    const snt = normalizeText(s.title);
                                    // Split title into words and find words longer than 4 chars that are NOT "masaje", "limpieza", etc.
                                    const uniqueWords = snt.split(/\s+/).filter(w => w.length > 4 && !["masaje", "limpieza", "facial", "tratamiento", "corporal"].includes(w));
                                    return uniqueWords.some(uw => normalizedContent.includes(uw));
                                });
                                
                                // 3. Final tie-breaker: similarity
                                if (potentialSvcs.length > 1 || potentialSvcs.length === 0) {
                                    // Recalculate if filtering was too aggressive or still ambiguous
                                    const originalSvcs = services.filter(s => {
                                         if (state.currentCategoryId && s.category_id !== state.currentCategoryId) return false;
                                         return normalizedContent.includes(normalizeText(s.title));
                                    });
                                    if (originalSvcs.length === 1) {
                                        potentialSvcs = originalSvcs;
                                    } else {
                                        const withSimilarity = (originalSvcs.length ? originalSvcs : services).map(s => ({ svc: s, sim: getSimilarity(normalizedContent, normalizeText(s.title)) }));
                                        withSimilarity.sort((a, b) => b.sim - a.sim);
                                        if (withSimilarity[0].sim > 0.85) potentialSvcs = [withSimilarity[0].svc];
                                        else potentialSvcs = []; // Too ambiguous
                                    }
                                }
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
                        } else {
                            // Affirmation or NEXT stage checking
                            const isAffirmation = intent === 'afirmacion_o_agregar_carrito' || normalizedContent.includes("si") || normalizedContent.includes("dale") || normalizedContent.includes("perfecto") || normalizedContent.includes("adelante") || normalizedContent.includes("asi esta bien") || normalizedContent.includes("listo");
                            if (isAffirmation && state.selectedServiceIds.length > 0) {
                                if (state.pendingCategoryIds.length > 0) {
                                    state.currentCategoryId = state.pendingCategoryIds.shift()!;
                                    state.stage = 'sub_service_selection';
                                } else {
                                    state.stage = 'cart_review';
                                    state.currentCategoryId = null;
                                }
                            } else if (intent === 'negacion_o_cerrar_carrito' || normalizedContent.includes("ningun") || normalizedContent.includes("nada") || normalizedContent.includes("no gracias") || normalizedContent.includes("bastante")) {
                                if (state.pendingCategoryIds.length > 0) {
                                    state.currentCategoryId = state.pendingCategoryIds.shift()!;
                                    state.stage = 'sub_service_selection';
                                } else {
                                    state.stage = state.selectedServiceIds.length > 0 ? 'cart_review' : 'parent_selection';
                                    state.currentCategoryId = null;
                                }
                            }
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
                            
                            // Does the message contain identifying words of THIS specific service?
                            if (normalizedContent.includes(nt)) return true;
                            
                            const svcParts = nt.split(/\s+/).filter(p => p.length > 3);
                            const identifyingPart = svcParts.find(p => ["ruso", "clasicas", "1x1", "polygel", "kapping", "lifting", "keratina"].includes(p));
                            
                            if (identifyingPart && normalizedContent.includes(identifyingPart)) return true;
                            
                            return inputParts.some(part => {
                                if (nt.includes(part) && svcParts.length === 1) return true;
                                const titleParts = nt.split(/\s+/);
                                return titleParts.some(tp => tp.length > 3 && getSimilarity(part, tp) > 0.95);
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
                        // Ensure we carry over the pending date/time explicitly to avoid race conditions in re-parsing
                        if (!state.requestedDate && state.pendingDate) state.requestedDate = state.pendingDate;
                        if (!state.requestedTime && state.pendingTime) state.requestedTime = state.pendingTime;
                    }
                }
                if (currentBotAsked === 'payment' || state.stage === 'payment_request' || state.stage === 'waiting_for_receipt') {
                    const isConfirmationText = normalizedContent.includes("pago") || normalizedContent.includes("comprobante") || normalizedContent.includes("listo") || normalizedContent.includes("enviado") || normalizedContent.includes("aca esta") || normalizedContent.includes("te mando") || normalizedContent.includes("ya esta");
                    // STICKY MEDIA TRAP: If they send media during THIS stage, WE MUST transition to waiting_for_receipt
                    if (hasMedia || isConfirmationText) {
                        state.stage = 'waiting_for_receipt';
                        console.log(`[stateMachine.ts] Turn ${i}: Detected receipt/confirmation. Transitioning stage definitively to waiting_for_receipt.`);
                    }
                }

                // EMERGENCY MEDIA TRAP: If they send media and we have a pending date/time, assume it's a receipt
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
            const isInteracting = ['sub_service_selection', 'cart_review', 'cart_confirmation'].includes(state.stage);
            const isFinished = ['done', 'waiting_for_receipt', 'payment_request'].includes(state.stage);
            
            if (!isInteracting && !isFinished) {
                if (!state.clientName || state.clientName === 'Cliente') {
                    state.stage = 'name_collection';
                    console.log(`[stateMachine.ts] Progression: name_collection`);
                } else if (!state.clientPhone || state.clientPhone === 'Cliente') {
                    // Safety: if we have name but no confirmable phone, ask for it
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
        // If the current stage is greeting but there are selected services and we were deep in a flow, 
        // it means we lost context. Let's recover the last logical stage.
        if (state.stage === 'greeting' && state.selectedServiceIds.length > 0) {
            let lastKnownStage: any = null;
            // Scan backwards through messages to find the last bot question
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
    
    // 1. TERMINAL CONFIRMATION (Top priority)
    if (state.stage === 'done' || (state.stage === 'waiting_for_receipt' && hasMediaInLastMsg)) {
        return "¡Excelente noticia! 💖 Recibimos tu comprobante correctamente. Tu turno ya quedó agendado y confirmado en nuestro sistema. ¡Qué placer va a ser recibirte en KÂLON para mimarte un rato! Nos vemos pronto. ✨";
    }

    const welcome = isFromWhatsApp 
        ? (state.clientName ? `¡Hola ${state.clientName.split(' ')[0]}! Qué lindo saludarte de nuevo. ` : "¡Hola! Qué lindo saludarte. Bienvenida a *KÂLON Estética* ✨. ")
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
                const list = subServices.map(s => {
                    const cleanDur = s.duration.toString().replace(/min/gi, '').replace(/minutos/gi, '').trim();
                    return `• *${s.title}* ($${s.price}) - ${cleanDur} min`;
                }).join('\n');
                
                const selectedCount = state.selectedServiceIds.length;
                let prefix = "";
                
                if (selectedCount > 0) {
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
                const list = selectedServices.map(s => `• *${s.title}* ($${s.price}) - ${s.duration.toString().replace(/min/g, '').trim()} min`).join('\n');
                const totalPrice = selectedServices.reduce((a, b) => a + Number(b.price), 0);
                const totalDur = selectedServices.reduce((a, b) => a + parseDuration(b.duration), 0);
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
                const totalDur = selectedServices.reduce((a, b) => a + parseDuration(b.duration), 0);
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
                    const totalDur = selectedSvc.reduce((a, b) => a + parseDuration(b.duration), 0);
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

                return `${personalGreeting}Tu sesión de *${serviceList}* durará aproximadamente *${durText}* y el valor total es de *$${totalPrice}*.\n\nPara confirmar definitivamente tu lugar el día *${formatDateHuman(state.pendingDate || '')}* a las *${state.pendingTime}hs*, necesitamos una seña del 50% (*$${deposit.toFixed(0)}*).\n\nTransferí al alias: *KALON.ESTETICA.OK* y enviame el comprobante por aquí. ¡Ya casi estamos! 📸`;
            }
            case 'waiting_for_receipt':
                return "Quedo atenta a tu comprobante de transferencia para terminar de confirmar tu turno. ¡Cualquier duda decime! 😊";
            default:
                return "¡Hola! ¿En qué más puedo ayudarte hoy para que te sientas radiante? ✨";
        }
    } catch (error) {
        console.error("[stateMachine.ts] Error in generateResponse:", error);
        return "Hubo un pequeño error procesando tu solicitud, ¿podrías repetirlo? 😊";
    }
}
