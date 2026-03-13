export const config = { runtime: 'edge' };

import { neon } from '@neondatabase/serverless';

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
};

// ─── Typing simulation helper ────────────────────────────────────────────────
function sseStream(text: string): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const words = text.split(' ');
            for (let i = 0; i < words.length; i++) {
                const chunk = (i === 0 ? '' : ' ') + words[i];
                const data = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                // Variable delay for human feel
                await new Promise(r => setTimeout(r, 20 + Math.random() * 40));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
        }
    });
    return new Response(stream, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
    });
}

// ─── Sophisticated State Extraction ──────────────────────────────────────────
const normalizeText = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "");

function findMultipleServiceMatches(userInput: string, services: Array<{ title: string; price: number }>): string[] {
    const normalizedInput = normalizeText(userInput);
    const results: Array<{ title: string, score: number }> = [];

    services.forEach(service => {
        const fullServiceName = normalizeText(service.title);
        let score = 0;

        if (normalizedInput.includes(fullServiceName)) {
            score += 10;
        }

        const words = fullServiceName.split(/\s+/).filter(w => w.length > 3);
        words.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            if (regex.test(normalizedInput)) {
                score += 3;
            } else if (normalizedInput.includes(word)) {
                score += 0.5;
            }
        });

        if (score >= 2.5) {
            results.push({ title: service.title, score });
        }
    });

    const uniqueMatches = Array.from(new Set(results.sort((a, b) => b.score - a.score).map(r => r.title)));
    return uniqueMatches;
}

interface ConvState {
    clientName: string | null;
    clientPhone: string | null;
    interestedService: string | null;
    detectedServices: string[];
    stage: 'greeting' | 'service_selection' | 'service_clarification' | 'name_collection' | 'phone_collection' | 'availability_proposal' | 'done';
    pendingDate: string | null;
    pendingTime: string | null;
    isAskingAlternatives: boolean;
    targetDate: string | null;
    previouslySuggestedCount: number;
    isAmbiguous: boolean;
    rejectedDates: string[];
    requestedTime: string | null;
    requestedAllOptions: boolean;
    lastMessageChangedService: boolean;
}

function extractState(messages: Array<{ role: string; content: string }>, services: Array<{ title: string; price: number }>): ConvState {
    const state: ConvState = {
        clientName: null,
        clientPhone: null,
        interestedService: null,
        detectedServices: [],
        stage: 'greeting',
        pendingDate: null,
        pendingTime: null,
        isAskingAlternatives: false,
        targetDate: null,
        previouslySuggestedCount: 0,
        isAmbiguous: false,
        rejectedDates: [],
        requestedTime: null,
        requestedAllOptions: false,
        lastMessageChangedService: false
    };

    if (messages.length === 0) return state;

    let currentBotAsked: 'name' | 'phone' | 'service' | 'availability' | null = null;

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        if (msg.role === 'assistant') {
            const botText = normalizeText(msg.content);
            if (botText.includes("tu nombre") || botText.includes("gusto de hablar")) currentBotAsked = 'name';
            else if (botText.includes("whatsapp") || botText.includes("telefono") || botText.includes("este numero") || botText.includes("brindarme algun otro")) currentBotAsked = 'phone';
            else if (botText.includes("servicio") || botText.includes("tratamiento") || botText.includes("opciones son")) currentBotAsked = 'service';
            else if (botText.includes("horario disponible") || botText.includes("serviria") || botText.includes("parece el") || botText.includes("proximo horario")) {
                currentBotAsked = 'availability';
                state.previouslySuggestedCount++;
                const dateMatch = msg.content.match(/(\d{4})-(\d{2})-(\d{2})/);
                const timeMatch = msg.content.match(/(\d{1,2}):(\d{2})/);
                if (dateMatch) state.pendingDate = dateMatch[0];
                if (timeMatch) state.pendingTime = timeMatch[0].padStart(5, '0');
            }
            continue;
        }

        if (msg.role === 'user') {
            const text = msg.content;
            const normalizedTextVal = normalizeText(text);
            const isLastMessage = i === messages.length - 1;

            // Service detection
            const matches = findMultipleServiceMatches(text, services);
            if (matches.length === 1) {
                const newService = matches[0];
                if (isLastMessage && state.interestedService && state.interestedService !== newService) {
                    state.lastMessageChangedService = true;
                }
                state.interestedService = newService;
                state.detectedServices = [];
            } else if (matches.length > 1) {
                state.detectedServices = matches;
                state.interestedService = null;
            }

            // Name collection
            if (state.interestedService && !state.clientName) {
                const nameKeywords = /\b(soy|me llamo|mi nombre es|nombre es|nombre:)\s*/i;
                const isNamePhrase = /\b(es mi nombre|soy yo|me llamo)\b/i.test(normalizedTextVal);

                if (currentBotAsked === 'name' || nameKeywords.test(text) || isNamePhrase) {
                    if (!/\d/.test(text)) {
                        const cleaned = text.replace(nameKeywords, '')
                            .replace(/\bes mi nombre\b/i, '')
                            .replace(/^(hola\s+)?/i, '')
                            .trim();

                        // Limit to reasonable full names (usually 1-4 words)
                        const wordCount = cleaned.split(/\s+/).length;
                        if (cleaned.length >= 2 && wordCount <= 4 && !/^(si|no|hola|quiero|turno|precio|info)$/i.test(cleaned)) {
                            state.clientName = cleaned.split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
                        }
                    }
                }
            }

            // Phone collection - FIXED: Persistent through history
            if (state.interestedService && state.clientName && !state.clientPhone) {
                const isConfirmation = /\b(este mismo|este|con este|si|dale|ok|usar este|asimismo|asi es|el mismo)\b/i.test(normalizedTextVal);
                if (currentBotAsked === 'phone' && (isConfirmation || normalizedTextVal === 'si')) {
                    state.clientPhone = 'CONFIRMED_CURRENT';
                } else {
                    const phoneMatch = text.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/);
                    if (phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 8) {
                        state.clientPhone = phoneMatch[0].trim();
                    }
                }
            }

            // Scheduling logic
            if (state.interestedService && state.clientName && state.clientPhone) {
                // Requested time
                const timeMatch = text.match(/(\d{1,2})[:h\s]*(\d{2})?hs?/i);
                if (timeMatch) {
                    const hours = timeMatch[1].padStart(2, '0');
                    const mins = timeMatch[2] || '00';
                    state.requestedTime = `${hours}:${mins}`;
                }

                // Requested all options
                if (/\b(todos|todas|opciones|lista|lista de turnos|lista de horarios|cuales hay|que horarios tenes)\b/i.test(normalizedTextVal)) {
                    state.requestedAllOptions = true;
                }

                // Date requests (future)
                if (normalizedTextVal.includes("mes que viene") || normalizedTextVal.includes("proximo mes")) {
                    const nextMonth = new Date();
                    nextMonth.setMonth(nextMonth.getMonth() + 1);
                    nextMonth.setDate(1);
                    state.targetDate = nextMonth.toISOString().split('T')[0];
                }

                // Rejections / Alternatives
                const userRejectsStrict = /\b(no|otro|cambiar|no puedo|busca|otra|me sirve|no me sirve|diferente|distinto|tenes otro|hay otro)\b/i.test(normalizedTextVal);
                if (userRejectsStrict || state.requestedTime || state.requestedAllOptions) {
                    state.isAskingAlternatives = true;
                    if (state.pendingDate) state.rejectedDates.push(state.pendingDate);
                }
            }
        }
    }

    // Final stage determination
    if (messages.length === 0) state.stage = 'greeting';
    else if (state.detectedServices.length > 1) state.stage = 'service_clarification';
    else if (!state.interestedService) state.stage = 'service_selection';
    else if (!state.clientName) state.stage = 'name_collection';
    else if (!state.clientPhone) state.stage = 'phone_collection';
    else state.stage = 'availability_proposal';

    return state;
}

function generateResponse(
    state: ConvState,
    services: Array<{ title: string; price: number }>,
    availableSlots: Array<{ date: string, time: string }>,
    isBookingConfirmed: boolean,
    isFirstResponse: boolean = false,
    isFromWhatsApp: boolean = false,
    messages: Array<{ role: string; content: string; media_url?: string; created_at?: string }> = []
): string {
    if (isBookingConfirmed) {
        return `¡Excelente! 🎉 He confirmado tu turno para *${state.interestedService}* el día *${state.pendingDate}* a las *${state.pendingTime}hs*. Estaremos esperándote en NOVA Estética para brindarte una experiencia única de lujo.\n\nQue tengas un día maravilloso. ✨ ¡Adiós!`;
    }

    const welcomeHeader = isFirstResponse ? "¡Hola! Bienvenido a *NOVA Estética*. 😊 " : "";

    if (state.lastMessageChangedService && state.interestedService) {
        const nextMissing = !state.clientName
            ? "Antes de ver la agenda, ¿con quién tengo el gusto de hablar?"
            : (isFromWhatsApp ? `Bien, *${state.clientName}*. Para poder enviarte los detalles de tu turno, ¿te registro con este número o con algún otro?` : `Bien, *${state.clientName}*. Para poder enviarte los detalles de tu turno, indícame tu número de WhatsApp.`);
        return `¡Perfecto! Cambiamos a *${state.interestedService}*. ✨ ${nextMissing}`;
    }

    switch (state.stage) {
        case 'greeting': {
            const svcList = services.map((s: { title: string; price: number }) => `• *${s.title}*`).join('\n');
            const intro = isFirstResponse ? `${welcomeHeader}Soy tu asistente virtual. ✨ ¿Qué tratamiento estás buscando?` : "¡Me encantaría ayudarte! ✨ ¿Qué tratamiento estás buscando?";
            return `${intro} Nuestras opciones son:\n\n${svcList}\n\nDime cuál prefieres para comenzar.`;
        }
        case 'service_selection': {
            const svcList = services.map(s => `• *${s.title}*`).join('\n');
            const intro = isFirstResponse ? `${welcomeHeader}Soy tu asistente virtual. ✨ ¿Qué tratamiento estás buscando?` : "¡Me encantaría ayudarte! ✨ ¿Qué tratamiento estás buscando?";
            return `${intro} Nuestras opciones son:\n\n${svcList}\n\nDime cuál prefieres para comenzar.`;
        }
        case 'service_clarification': {
            const list = state.detectedServices.join(' y ');
            return `${welcomeHeader}¡Hola! Veo que te interesan varios de nuestros tratamientos: *${list}*. 😊\n\n¿Te gustaría que agendemos un turno para ambos o preferís empezar con uno en particular?`;
        }
        case 'name_collection': {
            const intro = isFirstResponse ? `${welcomeHeader}¡Excelente elección! El *${state.interestedService}* es uno de nuestros tratamientos estrella. ✨` : `¡Excelente elección! El *${state.interestedService}* es uno de nuestros tratamientos estrella. ✨`;
            return `${intro} Antes de ver la agenda, ¿con quién tengo el gusto de hablar?`;
        }
        case 'phone_collection': {
            const assistantMsgs = messages.filter(m => m.role === 'assistant');
            const alreadyGreeted = assistantMsgs.some(m => m.content.includes("Un gusto conocerte") || m.content.includes("gusto de hablar"));
            const confirmName = (state.clientName && !alreadyGreeted) ? `¡Un gusto conocerte, *${state.clientName}*! 😊\n\n` : "";
            if (isFromWhatsApp) {
                return `${confirmName}Para poder enviarte los detalles de tu turno y registrar tu perfil, ¿te registro con este número o preferís brindarme algún otro?`;
            }
            return `${confirmName}Para poder enviarte los detalles de tu turno y registrar tu perfil, indícame tu número de WhatsApp.`;
        }
        case 'availability_proposal':
            if (state.requestedAllOptions && availableSlots.length > 0) {
                const options = availableSlots.slice(0, 5).map(s => `• *${s.date}* a las *${s.time}hs*`).join('\n');
                return `¡Por supuesto, *${state.clientName}*! Aquí tienes las próximas opciones disponibles para *${state.interestedService}*:\n\n${options}\n\n¿Cuál de estos te queda mejor? 😊`;
            }
            if (availableSlots.length > 0) {
                const slot = availableSlots[0];
                if (state.requestedTime) {
                    const isMatch = slot.time.startsWith(state.requestedTime.split(':')[0]);
                    if (isMatch) return `¡Buenas noticias! 😊 Tengo disponible el *${slot.date}* a las *${slot.time}hs*, tal como pediste. ✨ ¿Te gustaría confirmarlo?`;
                    else return `Lo siento, a las *${state.requestedTime}hs* no tengo lugar disponible. 🗓️ Pero tengo disponible el *${slot.date}* a las *${slot.time}hs*. ¿Te serviría?`;
                }
                if (state.isAskingAlternatives) {
                    return `¡Entendido! Busquemos otra opción. 😊 ¿Qué te parece el *${slot.date}* a las *${slot.time}hs*? ✨`;
                }
                const alreadyProposed = messages.some(m => m.role === 'assistant' && (m.content.includes("horario disponible") || m.content.includes("proximo horario")));
                if (alreadyProposed) return `¿Te gustaría confirmar el turno para el *${slot.date}* a las *${slot.time}hs* o prefieres que sigamos buscando? 🗓️`;

                return `¡Perfecto, *${state.clientName}*! Ya registré tus datos provisoriamente. 🌟\n\nPara *${state.interestedService}*, el próximo horario disponible que tengo es el *${slot.date} a las ${slot.time}hs*. 🗓️\n\n¿Te queda bien este horario o prefieres buscar otro? (Responde "sí" para confirmar)`;
            }
            return "Por el momento no tengo más espacios esta semana. 🗓️ ¿Te gustaría que busquemos para más adelante o que te avise si se libera un lugar? 😊";
        default:
            return "Entiendo. ¿Hay algo más en lo que pueda asistirte para que tu experiencia en NOVA sea perfecta? ✨";
    }
}


function formatForWhatsApp(text: string): string {
    return text.replace(/\*\*(.*?)\*\*/g, '*$1*').replace(/\*(.*?)\*/g, '_$1_').replace(/<br\s*\/?>/gi, '\n').trim();
}

interface LeadStatusResult {
    is_bot_enabled: boolean;
}

interface ServiceResult {
    title: string;
    price: number;
}

interface ChatHistoryResult {
    chat_history: Array<{ role: string; content: string }>;
}

interface AppointmentResult {
    date_time: string;
}

interface LeadIdResult {
    id: string;
}

export default async function handler(req: Request) {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    let userId: string | null = null;
    const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000000';
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    const returnFallback = (errorMsg: string) => {
        console.error("DEBUG - API ERROR:", errorMsg);
        const fallbackText = "Hola! ✨ Disculpa, estoy experimentando una pequeña intermitencia técnica. Pero no te preocupes, ya estoy trabajando para solucionarlo. Si quieres, prueba escribirme de nuevo en unos momentos. 😊";
        return new Response(JSON.stringify({ responseText: fallbackText, rawResponse: fallbackText, error: true, status: "success_fallback_emergency" }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    };

    try {
        let body;
        try { body = await req.json(); } catch (jsonErr) { return new Response(JSON.stringify({ error: "Invalid JSON format" }), { status: 400, headers: corsHeaders }); }

        userId = body.userId;
        const incomingMessage = body.message || "";
        let incomingMediaUrl = body.mediaUrl || null;
        const incomingMediaData = body.mediaData || null; // Base64 from Bridge

        // Auto-extract media URL if missing and message follows "📸 [Imagen enviada] (...) " pattern
        if (!incomingMediaUrl && incomingMessage.includes('📸 [Imagen enviada]')) {
            const urlMatch = incomingMessage.match(/\((https?:\/\/[^)]+)\)/);
            if (urlMatch) incomingMediaUrl = urlMatch[1];
        }

        let messages: Array<{ role: string; content: string; media_url?: string }> = body.messages || [];
        let isFirstInteraction = false;

        if (userId && typeof userId === 'string') {
            userId = userId.split('@')[0].replace(/[^0-9]/g, '');
        }

        if (!connectionString) throw new Error("Missing DATABASE_URL configuration");
        const sql = neon(connectionString);

        let botEnabledFromDb = true;
        if (userId) {
            // Robust phone normalization: remove all non-digits from both sides for comparison
            const leadStatus = await sql`
                SELECT is_bot_enabled 
                FROM leads 
                WHERE regexp_replace(contact_info->>'phone', '\\D', '', 'g') = ${userId}
                   OR regexp_replace(contact_info->>'phone', '\\D', '', 'g') LIKE ${'%' + userId}
                   OR ${userId.slice(-10)} = regexp_replace(contact_info->>'phone', '\\D', '', 'g')
                LIMIT 1
            ` as LeadStatusResult[];
            if (leadStatus.length > 0) {
                botEnabledFromDb = leadStatus[0].is_bot_enabled;
            }
        }

        if (userId && !messages.length && incomingMessage) {
            isFirstInteraction = true;
            try {
                const historyRes = await sql`
                    SELECT role, content, media_url, created_at 
                    FROM chat_logs 
                    WHERE lead_id = (
                        SELECT id FROM leads 
                        WHERE regexp_replace(contact_info->>'phone', '\\D', '', 'g') = ${userId}
                        LIMIT 1
                    )
                    ORDER BY created_at ASC
                ` as Array<{ role: string; content: string; media_url?: string; created_at?: string }>;
                if (historyRes.length > 0) {
                    messages = historyRes;
                }
            } catch (historyErr) { console.error("History fetch error:", historyErr); }
            messages.push({ role: 'user', content: incomingMessage, media_url: incomingMediaUrl });
        }

        // ─── WEB CHAT INITIALIZATION ───
        if (messages.length === 0 && !incomingMessage && !userId) {
            const servicesRes = await sql`SELECT title, price FROM services WHERE active = true ORDER BY sort_order ASC, created_at ASC` as ServiceResult[];
            const services = servicesRes as Array<{ title: string; price: number }>;

            const webInitialState: ConvState = {
                clientName: null,
                clientPhone: null,
                interestedService: null,
                detectedServices: [],
                stage: 'greeting',
                pendingDate: null,
                pendingTime: null,
                isAskingAlternatives: false,
                targetDate: null,
                previouslySuggestedCount: 0,
                isAmbiguous: false,
                rejectedDates: [],
                requestedTime: null,
                requestedAllOptions: false,
                lastMessageChangedService: false
            };

            const responseText = generateResponse(webInitialState, services, [], false, true, false, []);
            return sseStream(responseText);
        }

        if (messages.length === 0) return new Response(JSON.stringify({ error: "Empty conversation" }), { status: 400, headers: corsHeaders });

        const servicesRes = await sql`SELECT title, price FROM services WHERE active = true ORDER BY sort_order ASC, created_at ASC` as ServiceResult[];
        const services = servicesRes as Array<{ title: string; price: number }>;
        const state = extractState(messages, services);

        const foundSlots: Array<{ date: string, time: string }> = [];
        if (state.stage === 'availability_proposal' && state.interestedService) {
            let searchDate = new Date();
            if (state.targetDate) {
                const target = new Date(state.targetDate);
                if (target > searchDate) searchDate = target;
            } else {
                searchDate.setDate(searchDate.getDate() + 1); // Mañana por defecto
            }

            let totalFoundToSkip = 0;
            const targetCount = state.requestedAllOptions ? 5 : 1;
            const maxDays = 60; // Buscar hasta 2 meses

            for (let d = 0; d < maxDays && foundSlots.length < targetCount; d++) {
                const dateStr = searchDate.toISOString().split('T')[0];
                const dayOfWeek = searchDate.getUTCDay();

                // Saltamos domingos (0) si la estética cierra
                if (dayOfWeek === 0) {
                    searchDate.setDate(searchDate.getDate() + 1);
                    continue;
                }

                if (state.rejectedDates.includes(dateStr)) {
                    searchDate.setDate(searchDate.getDate() + 1);
                    continue;
                }

                const taken = await sql`SELECT date_time FROM appointments WHERE date_time::date = ${dateStr} AND status != 'canceled'` as AppointmentResult[];
                const takenHours = new Set(taken.map(r => new Date(r.date_time).getUTCHours()));

                // Si el usuario pidió una hora específica, priorizamos ese bloque
                if (state.requestedTime && !state.requestedAllOptions) {
                    const reqH = parseInt(state.requestedTime.split(':')[0]);
                    if (reqH >= 10 && reqH <= 19 && !takenHours.has(reqH)) {
                        foundSlots.push({ date: dateStr, time: `${reqH.toString().padStart(2, '0')}:00` });
                        if (foundSlots.length >= targetCount) break;
                    }
                }

                // Horarios estándar de 10hs a 19hs
                for (let h = 10; h <= 19; h++) {
                    if (state.requestedTime && !state.requestedAllOptions && parseInt(state.requestedTime.split(':')[0]) === h) continue;
                    if (!takenHours.has(h)) {
                        totalFoundToSkip++;
                        // Si no estamos pidiendo "todos", saltamos los que ya sugerimos anteriormente
                        if (state.requestedAllOptions || totalFoundToSkip > state.previouslySuggestedCount) {
                            foundSlots.push({ date: dateStr, time: `${h.toString().padStart(2, '0')}:00` });
                            if (foundSlots.length >= targetCount) break;
                        }
                    }
                }
                searchDate.setDate(searchDate.getDate() + 1);
            }
        }

        const lastUserMsg = messages.filter((m: { role: string }) => m.role === 'user').pop()?.content.toLowerCase() || "";
        const userConfirms = /\b(si|sí|dale|ok|perfecto|bien|confirmar|confirmado|confirmo|claro|por supuesto|está bien|esta bien)\b/i.test(lastUserMsg);
        const userRejects = /\b(no|otro|cambiar|no puedo|busca|otra|me sirve|no me sirve|mejor no)\b/i.test(lastUserMsg);

        let isBookingConfirmed = false;
        if (state.stage === 'availability_proposal' && userConfirms && !userRejects && state.pendingDate && state.pendingTime) {
            const dateTimeStr = `${state.pendingDate}T${state.pendingTime}:00Z`;
            const phoneForQueries = userId || state.clientPhone;

            if (phoneForQueries) {
                // ─── ROBUST LEAD RESOLUTION ───
                let leadId: string | null = null;
                const leads = await sql`
                SELECT id 
                FROM leads 
                WHERE regexp_replace(contact_info->>'phone', '\\D', '', 'g') = ${phoneForQueries.replace(/\D/g, '')}
                   OR regexp_replace(contact_info->>'phone', '\\D', '', 'g') LIKE ${'%' + phoneForQueries.replace(/\D/g, '')}
                LIMIT 1
            ` as LeadIdResult[];

                leadId = leads.length > 0 ? leads[0].id : null;

                if (!leadId) {
                    const newLead = await sql`
                    INSERT INTO leads (client_name, contact_info, status, intent_score, organization_id)
                    VALUES (${state.clientName || 'Cliente WhatsApp'}, ${JSON.stringify({ phone: phoneForQueries, source: 'whatsapp' })}, 'qualified', 90, ${DEFAULT_ORG_ID})
                    RETURNING id
                ` as LeadIdResult[];
                    leadId = newLead[0].id;
                }

                if (leadId) {
                    const existingApps = await sql`SELECT id FROM appointments WHERE lead_id = ${leadId} AND date_time = ${dateTimeStr} AND status != 'canceled'` as LeadIdResult[];
                    if (existingApps.length === 0) {
                        await sql`INSERT INTO appointments (lead_id, organization_id, date_time, service_type, status) 
                            VALUES (${leadId}, ${DEFAULT_ORG_ID}, ${dateTimeStr}, ${state.interestedService}, 'confirmed')`;
                    } else {
                        await sql`UPDATE appointments SET status = 'confirmed' WHERE id = ${(existingApps as { id: string }[])[0].id}`;
                    }
                    isBookingConfirmed = true;
                }
            }
        }

        if (!botEnabledFromDb) {
            const finalClientName = state.clientName || "Cliente WhatsApp";
            const phoneToUse = (state.clientPhone === 'CONFIRMED_CURRENT' ? userId : state.clientPhone) || userId;

            if (phoneToUse) {
                const existingLeads = await sql`SELECT id FROM leads WHERE regexp_replace(contact_info->>'phone', '\\D', '', 'g') = ${phoneToUse.replace(/\D/g, '')} LIMIT 1` as LeadIdResult[];
                let leadId: string;
                
                if (existingLeads.length > 0) {
                    leadId = existingLeads[0].id;
                    await sql`UPDATE leads SET client_name = ${finalClientName}, updated_at = CURRENT_TIMESTAMP WHERE id = ${leadId}`;
                } else {
                    const newLead = await sql`INSERT INTO leads (organization_id, client_name, contact_info, status, intent_score) VALUES (${DEFAULT_ORG_ID}, ${finalClientName}, ${JSON.stringify({ phone: phoneToUse })}, 'qualified', 50) RETURNING id` as LeadIdResult[];
                    leadId = newLead[0].id;
                }

                if (incomingMessage || incomingMediaUrl || incomingMediaData) {
                    await sql`INSERT INTO chat_logs (lead_id, role, content, media_url, media_data, sent_to_whatsapp) 
                                VALUES (${leadId}, 'user', ${incomingMessage}, ${incomingMediaUrl}, ${incomingMediaData}, true)`;
                }
            }

            return new Response(JSON.stringify({ 
                botPaused: true, 
                responseText: "", 
                status: "manual_mode",
                messageLogged: true 
            }), { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        const responseText = generateResponse(state, services, foundSlots, isBookingConfirmed, isFirstInteraction, !!userId, messages);
        const phoneToUse = (state.clientPhone === 'CONFIRMED_CURRENT' ? userId : state.clientPhone) || userId;

        if (phoneToUse) {
            const intentScore = isBookingConfirmed ? 100 : 80;
            const finalClientName = state.clientName || "Cliente WhatsApp";
            
            // 1. Get leadId
            const existingLeads = await sql`SELECT id FROM leads WHERE regexp_replace(contact_info->>'phone', '\\D', '', 'g') = ${phoneToUse.replace(/\D/g, '')} LIMIT 1` as LeadIdResult[];
            let leadId: string;
            
            if (existingLeads.length > 0) {
                leadId = existingLeads[0].id;
                await sql`UPDATE leads SET client_name = ${finalClientName}, intent_score = ${intentScore}, updated_at = CURRENT_TIMESTAMP WHERE id = ${leadId}`;
            } else {
                const newLead = await sql`INSERT INTO leads (organization_id, client_name, contact_info, status, intent_score) VALUES (${DEFAULT_ORG_ID}, ${finalClientName}, ${JSON.stringify({ phone: phoneToUse })}, 'qualified', ${intentScore}) RETURNING id` as LeadIdResult[];
                leadId = newLead[0].id;
            }

            // 2. Log last user message and bot response to chat_logs
            if (incomingMessage || incomingMediaUrl || incomingMediaData) {
              await sql`INSERT INTO chat_logs (lead_id, role, content, media_url, media_data, sent_to_whatsapp) 
                        VALUES (${leadId}, 'user', ${incomingMessage}, ${incomingMediaUrl}, ${incomingMediaData}, true)`;
            }
            await sql`INSERT INTO chat_logs (lead_id, role, content, sent_to_whatsapp) 
                      VALUES (${leadId}, 'bot', ${responseText}, false)`; // Bot messages might need pushing too if bridged differently
        }

        if (userId) {
            return new Response(JSON.stringify({ responseText: formatForWhatsApp(responseText), rawResponse: responseText, state: { stage: state.stage, clientName: state.clientName, service: state.interestedService } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return sseStream(responseText);
    } catch (e) { return returnFallback(e instanceof Error ? e.message : String(e)); }
}
