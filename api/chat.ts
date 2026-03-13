export const config = { runtime: 'nodejs' };

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

// Note: node-nlp is a CommonJS module
import pkgNlp from 'node-nlp';
const { NlpManager } = pkgNlp;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
};

// ─── Singleton NLP Manager ───────────────────────────────────────────────────
let manager: any = null;
async function getNlpManager() {
    if (manager) return manager;
    manager = new NlpManager({ languages: ['es'], forceNER: false, nlp: { useNativeSentiment: false } });
    
    // Optimized: Use pre-trained model to avoid timeouts on serverless cold starts
    const modelPath = path.join(process.cwd(), 'Entrenamiento NLP', 'model-es.json');
    if (fs.existsSync(modelPath)) {
        const data = fs.readFileSync(modelPath, 'utf8');
        manager.import(data);
    } else {
        // Fallback for local development if model is missing
        const corpusPath = path.join(process.cwd(), 'Entrenamiento NLP', 'corpus-es.json');
        if (fs.existsSync(corpusPath)) {
            const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
            manager.addCorpus(corpus);
            await manager.train();
        }
    }
    return manager;
}

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

const normalizeText = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "");

// ─── ConvState Interface ─────────────────────────────────────────────────────
interface ConvState {
    clientName: string | null;
    clientPhone: string | null;
    selectedServiceIds: string[];
    currentCategoryId: string | null;
    stage: 'greeting' | 'parent_selection' | 'sub_service_selection' | 'cart_confirmation' | 'name_collection' | 'phone_collection' | 'availability_proposal' | 'payment_request' | 'waiting_for_receipt' | 'done';
    pendingDate: string | null;
    pendingTime: string | null;
    rejectedDates: string[];
    requestedTime: string | null;
    requestedAllOptions: boolean;
    lastIntent?: string;
}

// ─── State Extraction Logic ──────────────────────────────────────────────────
async function extractState(
    messages: Array<{ role: string; content: string }>, 
    categories: any[], 
    services: any[]
): Promise<ConvState> {
    const state: ConvState = {
        clientName: null,
        clientPhone: null,
        selectedServiceIds: [],
        currentCategoryId: null,
        stage: 'greeting',
        pendingDate: null,
        pendingTime: null,
        rejectedDates: [],
        requestedTime: null,
        requestedAllOptions: false
    };

    if (messages.length === 0) return state;

    let currentBotAsked: string | null = null;
    const nlp = await getNlpManager();

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const normalizedContent = normalizeText(msg.content);

        if (msg.role === 'assistant') {
            const botText = msg.content.toLowerCase();
            if (botText.includes("elegir una categoria") || botText.includes("nuestras categorias")) currentBotAsked = 'category';
            else if (botText.includes("servicios de") || botText.includes("estos son los tratamientos")) currentBotAsked = 'sub_service';
            else if (botText.includes("agregar algo mas") || botText.includes("avanzamos con el turno")) currentBotAsked = 'cart_confirmation';
            else if (botText.includes("tu nombre") || botText.includes("con quien tengo")) currentBotAsked = 'name';
            else if (botText.includes("whatsapp") || botText.includes("numero") || botText.includes("este numero")) currentBotAsked = 'phone';
            else if (botText.includes("proximo horario") || botText.includes("confirmar el turno")) {
                currentBotAsked = 'availability';
                const dateMatch = msg.content.match(/(\d{4})-(\d{2})-(\d{2})/);
                const timeMatch = msg.content.match(/(\d{1,2}):(\d{2})/);
                if (dateMatch) state.pendingDate = dateMatch[0];
                if (timeMatch) state.pendingTime = timeMatch[0].padStart(5, '0');
            }
            else if (botText.includes("necesitamos una seña")) currentBotAsked = 'payment';
            
            // Re-detect selected services from assistant confirmations to keep state sync
            services.forEach(s => {
                if (botText.includes(s.title.toLowerCase()) && (botText.includes("agregue") || botText.includes("seleccionaste"))) {
                    if (!state.selectedServiceIds.includes(s.id)) state.selectedServiceIds.push(s.id);
                }
            });

            continue;
        }

        if (msg.role === 'user') {
            const isLastMessage = i === messages.length - 1;
            const nlpResult = isLastMessage ? await nlp.process('es', msg.content) : null;
            const intent = nlpResult?.intent;
            if (isLastMessage) state.lastIntent = intent;

            // 1. Process intents for specific transitions
            if (intent === 'saludo' || intent === 'pedir_turno_general' || intent === 'listar_servicios') {
                if (state.stage === 'greeting') state.stage = 'parent_selection';
            }

            // 2. Data collection (Name/Phone)
            if (currentBotAsked === 'name' && !state.clientName) {
                if (!/\d/.test(msg.content)) {
                    state.clientName = msg.content.split(/\s+/).slice(0, 4).join(' ');
                }
            }
            if (currentBotAsked === 'phone' && !state.clientPhone) {
                if (intent === 'afirmacion_o_agregar_carrito' || normalizedContent.includes("este mismo")) {
                    state.clientPhone = 'CONFIRMED_CURRENT';
                } else {
                    const phoneMatch = msg.content.match(/\d{8,15}/);
                    if (phoneMatch) state.clientPhone = phoneMatch[0];
                }
            }

            // 3. Category/Service Selection
            if (currentBotAsked === 'category') {
                const foundCat = categories.find(c => normalizedContent.includes(normalizeText(c.name)));
                if (foundCat) {
                    state.currentCategoryId = foundCat.id;
                    state.stage = 'sub_service_selection';
                }
            }
            if (currentBotAsked === 'sub_service') {
                const foundSvc = services.find(s => s.category_id === state.currentCategoryId && normalizedContent.includes(normalizeText(s.title)));
                if (foundSvc) {
                    if (!state.selectedServiceIds.includes(foundSvc.id)) state.selectedServiceIds.push(foundSvc.id);
                    state.stage = 'cart_confirmation';
                }
            }

            // 4. Cart Logic
            if (currentBotAsked === 'cart_confirmation') {
                if (intent === 'afirmacion_o_agregar_carrito') {
                    state.stage = 'parent_selection';
                } else if (intent === 'negacion_o_cerrar_carrito' || intent === 'pedir_turno_general') {
                    state.stage = 'name_collection';
                }
            }

            // 5. Scheduling Rejections
            if (currentBotAsked === 'availability') {
                if (intent === 'negacion_o_cerrar_carrito' || normalizedContent.includes("otro") || normalizedContent.includes("no puedo")) {
                    if (state.pendingDate) state.rejectedDates.push(state.pendingDate);
                }
            }
        }
    }

    // Final Stage Refinement
    if (state.selectedServiceIds.length > 0) {
        if (!state.clientName) state.stage = 'name_collection';
        else if (!state.clientPhone) state.stage = 'phone_collection';
        else if (!state.pendingDate) state.stage = 'availability_proposal';
        else if (state.stage === 'availability_proposal' && state.lastIntent === 'afirmacion_o_agregar_carrito') state.stage = 'payment_request';
    }

    return state;
}

// ─── Response Generation Logic ───────────────────────────────────────────────
function generateResponse(
    state: ConvState,
    categories: any[],
    services: any[],
    availableSlots: any[],
    isFromWhatsApp: boolean,
    hasMediaInLastMsg: boolean
): string {
    const welcome = isFromWhatsApp ? "¡Hola! Bienvenido a *KÂLON Estética*. ✨ " : "";
    
    // Check for receipt in waiting_for_receipt stage
    if (state.stage === 'waiting_for_receipt' && hasMediaInLastMsg) {
        return "¡Excelente! Recibimos tu comprobante. ✅ Tu turno quedó confirmado en nuestro sistema. ¡Te esperamos en KÂLON para brindarte una experiencia única! ✨";
    }

    switch (state.stage) {
        case 'greeting':
        case 'parent_selection': {
            const catList = categories.map(c => `• *${c.name}*`).join('\n');
            return `${welcome}Soy tu asistente virtual. Para comenzar, por favor elige una categoría de interés:\n\n${catList}\n\nEscribe el nombre de la categoría para ver los tratamientos disponibles.`;
        }
        case 'sub_service_selection': {
            const cat = categories.find(c => c.id === state.currentCategoryId);
            const subServices = services.filter(s => s.category_id === state.currentCategoryId);
            const list = subServices.map(s => `• *${s.title}* ($${s.price}) - ${s.duration} min`).join('\n');
            return `Estos son los tratamientos de *${cat?.name}*. ¿Cuál te gustaría realizarte?\n\n${list}\n\nEscribe el nombre del tratamiento para agregarlo a tu reserva.`;
        }
        case 'cart_confirmation': {
             const selectedNames = services.filter(s => state.selectedServiceIds.includes(s.id)).map(s => s.title).join(', ');
             return `¡Agregado! ✅ Actualmente tienes seleccionado: *${selectedNames}*.\n\n¿Te gustaría agregar algo más o ya avanzamos con la búsqueda de tu turno?`;
        }
        case 'name_collection': {
            return "¡Genial! Para agendar tu visita, ¿podrias decirme tu nombre completo?";
        }
        case 'phone_collection': {
            if (isFromWhatsApp) {
                return `Un gusto, *${state.clientName}*. 😊 ¿Te registro con este número de WhatsApp o prefieres brindarme otro?`;
            }
            return `Un gusto, *${state.clientName}*. 😊 Por favor, indícame tu número de WhatsApp para enviarte el comprobante de reserva.`;
        }
        case 'availability_proposal': {
            if (availableSlots.length > 0) {
                const slot = availableSlots[0];
                const totalDur = services.filter(s => state.selectedServiceIds.includes(s.id)).reduce((a, b) => a + b.duration, 0);
                return `Tengo disponibilidad para tus servicios (Duración: *${totalDur} min*) el día *${slot.date}* a las *${slot.time}hs*. 🗓️\n\n¿Te queda bien este horario para confirmar?`;
            }
            return "Lo siento, no encuentro horarios disponibles esta semana para esa duración total. 🗓️ ¿Te gustaría que busquemos para la próxima semana?";
        }
        case 'payment_request': {
            const selectedSvc = services.filter(s => state.selectedServiceIds.includes(s.id));
            const totalPrice = selectedSvc.reduce((a, b) => a + b.price, 0);
            const totalDur = selectedSvc.reduce((a, b) => a + Number(b.duration), 0);
            const deposit = totalPrice * 0.5;
            const hours = Math.floor(totalDur / 60);
            const mins = totalDur % 60;
            const durText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

            return `¡Perfecto! Tus servicios durarán aproximadamente *${durText}*. El costo total es de *$${totalPrice}*.\n\nPara reservar definitivamente tu lugar el *${state.pendingDate}* a las *${state.pendingTime}hs*, necesitamos una seña del 50% (*$${deposit.toFixed(0)}*).\n\nTransferí al alias: *KALON.ESTETICA.OK* y envíame la foto del comprobante por aquí. 📸`;
        }
        case 'waiting_for_receipt':
            return "Quedo a la espera del comprobante de transferencia para confirmar tu turno. ¡Muchas gracias! 😊";
        default:
            return "Disculpa, ¿en qué más puedo ayudarte? ✨";
    }
}

function formatForWhatsApp(text: string): string {
    return text.replace(/\*\*(.*?)\*\*/g, '*$1*').trim();
}

// ─── Main Handler ────────────────────────────────────────────────────────────
export default async function handler(req: Request) {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    const sql = neon(connectionString!);
    const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000000';

    try {
        const body = await req.json();
        const incomingMessage = body.message || "";
        const userId = body.userId ? body.userId.split('@')[0].replace(/\D/g, '') : null;
        let incomingMediaUrl = body.mediaUrl || null;
        
        // Attachment detection
        if (!incomingMediaUrl && incomingMessage.includes('📸 [Imagen enviada]')) {
            const urlMatch = incomingMessage.match(/\((https?:\/\/[^)]+)\)/);
            if (urlMatch) incomingMediaUrl = urlMatch[1];
        }

        const categories = await sql`SELECT id, name FROM categories WHERE active = true ORDER BY sort_order ASC`;
        const services = await sql`SELECT id, category_id, title, price, duration FROM services WHERE active = true ORDER BY sort_order ASC`;
        
        // Fetch history if from WhatsApp
        let messages = body.messages || [];
        if (userId && !messages.length && incomingMessage) {
            const history = await sql`
                SELECT role, content, media_url FROM chat_logs 
                WHERE lead_id = (
                    SELECT id FROM leads 
                    WHERE regexp_replace(contact_info->>'phone', '\\D', '', 'g') LIKE ${'%' + userId}
                    LIMIT 1
                ) ORDER BY created_at ASC
            ` as any[];
            messages = history.length > 0 ? history : [];
            messages.push({ role: 'user', content: incomingMessage });
        }

        const state = await extractState(messages, categories, services);
        
        // Availability Logic with Multi-service Duration
        const foundSlots: any[] = [];
        if (state.stage === 'availability_proposal' && state.selectedServiceIds.length > 0) {
            const totalDur = services.filter(s => state.selectedServiceIds.includes(s.id)).reduce((a, b) => a + b.duration, 0);
            const blocksNeeded = Math.ceil(totalDur / 60);
            
            let searchDate = new Date();
            searchDate.setDate(searchDate.getDate() + 1); // Start tomorrow

            for (let d = 0; d < 30 && foundSlots.length < 1; d++) {
                if (searchDate.getDay() === 0) { searchDate.setDate(searchDate.getDate() + 1); continue; }
                const dateStr = searchDate.toISOString().split('T')[0];
                if (state.rejectedDates.includes(dateStr)) { searchDate.setDate(searchDate.getDate() + 1); continue; }

                const taken = await sql`SELECT date_time FROM appointments WHERE date_time::date = ${dateStr} AND status != 'canceled'`;
                const takenHours = new Set(taken.map(r => new Date(r.date_time).getUTCHours()));

                for (let h = 9; h <= 20 - blocksNeeded; h++) {
                    let free = true;
                    for (let b = 0; b < blocksNeeded; b++) {
                        if (takenHours.has(h + b)) { free = false; break; }
                    }
                    if (free) {
                        foundSlots.push({ date: dateStr, time: `${h.toString().padStart(2, '0')}:00` });
                        break;
                    }
                }
                searchDate.setDate(searchDate.getDate() + 1);
            }
        }

        // Automatic receipt handling
        let isFinalConfirmation = false;
        if ((state.stage === 'waiting_for_receipt' || state.stage === 'payment_request') && (incomingMediaUrl || body.mediaData)) {
            const phone = (userId || state.clientPhone || '').replace(/\D/g, '');
            const leadRes = await sql`SELECT id FROM leads WHERE regexp_replace(contact_info->>'phone', '\\D', '', 'g') LIKE ${'%' + phone} LIMIT 1` as any[];
            if (leadRes.length > 0) {
                const leadId = leadRes[0].id;
                const svcTitles = services.filter(s => state.selectedServiceIds.includes(s.id)).map(s => s.title).join(' + ');
                const dateTime = `${state.pendingDate}T${state.pendingTime}:00Z`;
                
                await sql`INSERT INTO appointments (lead_id, organization_id, date_time, service_type, status) 
                          VALUES (${leadId}, ${DEFAULT_ORG_ID}, ${dateTime}, ${svcTitles}, 'confirmed')`;
                isFinalConfirmation = true;
                state.stage = 'done';
            }
        }

        const responseText = generateResponse(state, categories, services, foundSlots, !!userId, !!(incomingMediaUrl || body.mediaData));
        
        // Log to DB
        if (userId || state.clientPhone) {
            const phone = (userId || state.clientPhone || '').replace(/\D/g, '');
            const leadSearch = await sql`SELECT id FROM leads WHERE regexp_replace(contact_info->>'phone', '\\D', '', 'g') LIKE ${'%' + phone} LIMIT 1` as any[];
            let leadId = leadSearch.length > 0 ? leadSearch[0].id : null;
            
            if (!leadId && (state.clientName || userId)) {
                const res = await sql`INSERT INTO leads (organization_id, client_name, contact_info, status, intent_score) 
                                      VALUES (${DEFAULT_ORG_ID}, ${state.clientName || 'Cliente'}, ${JSON.stringify({ phone: phone, source: userId ? 'whatsapp' : 'web' })}, 'qualified', 70) 
                                      RETURNING id` as any[];
                leadId = res[0].id;
            }

            if (leadId) {
                await sql`INSERT INTO chat_logs (lead_id, role, content, media_url, sent_to_whatsapp) 
                          VALUES (${leadId}, 'user', ${incomingMessage}, ${incomingMediaUrl}, ${!!userId})`;
                await sql`INSERT INTO chat_logs (lead_id, role, content, sent_to_whatsapp) 
                          VALUES (${leadId}, 'bot', ${responseText}, ${!!userId})`;
            }
        }

        if (userId) {
            return new Response(JSON.stringify({ responseText: formatForWhatsApp(responseText), stage: state.stage }), { headers: corsHeaders });
        } else {
            return sseStream(responseText);
        }
    } catch (e: any) {
        console.error(e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
}
