import OpenAI from 'openai';
import { createLead, sql, getCategories, getServicesByCategory, findLeadByInitId } from './_services/db.js';
import { parseRelativeDate } from './_services/utils.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  maxDuration: 60,
};

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || 'sk-or-dummy',
});

/**
 * CHATBOT HÍBRIDO KÂLON (v2.5) - REFACTORIZADO PARA ROBUSTEZ TOTAL
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { messages = [], leadId, identificationId, message, mediaUrl } = req.body as { 
            messages: Array<{ role: string; content: string }>;
            leadId?: string | number;
            identificationId?: string;
            message?: string;
            mediaUrl?: string;
        };
        
        const lastMessage = messages[messages.length - 1];
        const text = (message || lastMessage?.content || '').trim();
        const lastBotMsg = messages.filter(m => m.role === 'assistant').pop()?.content || '';
        const isGreeting = text.toLowerCase().length < 6 && (text.toLowerCase().includes('hola') || text.toLowerCase().includes('buen'));

        console.log(`[api/chat] MSG: "${text}" | ID: ${identificationId} | LeadId: ${leadId}`);

        // --- 1. PRE-PROCESAMIENTO: IDENTIFICACIÓN ROBUSTA Y CONSULTAS EN PARALELO ---
        let leadByInitId = null;
        let activeLeadId: string | number | null = leadId || null;
        let currentStage = '1'; // Etapa inicial por defecto
        let currentState: any = { stage: '1' };

        // Promesas en paralelo para reducir latencia drásticamente
        const initIdPromise = (identificationId && String(identificationId).length > 10 && !activeLeadId) 
            ? findLeadByInitId(String(identificationId)).catch(() => null)
            : Promise.resolve(null);
        
        const categoriesPromise = getCategories().catch(() => []) as Promise<Array<{ id: string | number, name: string, price_list_url?: string }>>;
        const servicesPromise = sql`SELECT s.title, c.id as category_id FROM services s LEFT JOIN categories c ON s.category_id = c.id WHERE s.active = true`.catch(() => []);

        const [fetchedLead, categories, services] = await Promise.all([initIdPromise, categoriesPromise, servicesPromise]);

        if (fetchedLead) {
            leadByInitId = fetchedLead;
            activeLeadId = leadByInitId.id;
            currentState = leadByInitId.current_state || { stage: '1' };
            currentStage = String(currentState.stage || '1');
            console.log(`[api/chat] Lead recuperado: ${activeLeadId} | Etapa: ${currentStage}`);
        }

        // --- 2. CLASIFICACIÓN DE INTENCIÓN (IA) ---
        const catList = categories.map((c: any) => {
            const sList = services.filter((s: any) => s.category_id === c.id).map((s: any) => s.title).join(', ');
            return `${c.id}: ${c.name} (${sList || 'sin servicios'})`;
        }).join('\n        ');
        
        const recentHistory = messages.slice(-4, -1).map(m => `${m.role === 'assistant' ? 'Asistente' : 'Usuario'}: ${m.content}`).join('\n');

        const classificationPrompt = `Analiza el mensaje del usuario para KÂLON Estética y clasifica su intención.
        Categorías disponibles y sus servicios comunes:
        ${catList}
        
        Estado actual del Lead: ${activeLeadId ? 'Identificado' : 'No Identificado'}
        Etapa actual del Chatbot: ${currentStage} (1: Registro, 2: Catálogo, 3: Presupuesto, 4: Agenda, 5: Pre-reserva, 6: Confirmación)
        
        Contexto reciente de la conversación:
        ${recentHistory}
        IMPORTANTE: Si el usuario está agendando un turno o preguntando disponibilidad, ASEGÚRATE de inferir y rellenar "detected_categories" basándote en el 'Contexto reciente de la conversación', extrayendo los IDs de los servicios que solicitó previamente.
        
        Responde ÚNICAMENTE un objeto JSON con el siguiente formato exacto:
        {
          "intent": "SALUDO" | "REGISTRO" | "CONSULTA_SERVICIO" | "TURNO" | "OTRO",
          "detected_categories": ["id1", "id2"],
          "detected_name": "nombre si es registro",
          "is_negation": true/false
        }
        
        Mensaje actual del usuario: "${text}"`;

        // === PRE-CLASIFICACIÓN POR KEYWORDS (ahorra 2-4s en casos obvios) ===
        const textLow = text.toLowerCase();
        let preClassified: { intent?: string; detected_categories?: any[]; detected_name?: string; is_negation?: boolean } | null = null;
        if (!activeLeadId && /^(hola[!.]?|buenas?[!.]?|buenos?\s+d[ií]as?[!.]?|buen[a]?\s+tarde[s]?|buen[a]?\s+noche[s]?)\s*$/i.test(text.trim())) {
            preClassified = { intent: 'SALUDO', detected_categories: [], is_negation: false };
        } else if (activeLeadId && /\b(turno|cita|agendar|reservar|disponib|me\s+anot|qu[eé]\s+horario|qu[eé]\s+d[ií]a)\b/i.test(text) && !/servicio|precio|cu[aá]nto|cuesta/i.test(text)) {
            preClassified = { intent: 'TURNO', detected_categories: [], is_negation: false };
        } else if (activeLeadId && /depilac|facial|corporal|masaj|psicolog|pesta[ñn]|podolog|lifting|l[aá]ser|laser|cera|manicur|pedicur|hidrat|micropig|tratamiento|precio|cu[aá]nto|cuanto|cuesta|servic|qu[eé]\s+tienen|qu[eé]\s+ofrecen/i.test(text)) {
            // CONSULTA_SERVICIO: menciona un servicio/tratamiento específico — sin pasar por IA
            preClassified = { intent: 'CONSULTA_SERVICIO', detected_categories: [], is_negation: false };
        }

        const classificationResponse = preClassified ? null : await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash',
            messages: [{ role: 'system', content: classificationPrompt }],
            response_format: { type: 'json_object' }
        }, { timeout: 4000 }).catch((e) => {
            console.warn('[api/chat] Classification timeout/error:', e.message);
            return null;
        });

        // Blindaje robusto: extrae JSON aunque venga envuelto en ```json ... ```
        let classification: { intent?: string; detected_categories?: any[]; detected_name?: string; is_negation?: boolean } = preClassified || {};
        try {
            if (!preClassified) {
                const rawContent = classificationResponse?.choices[0]?.message?.content || '{}';
                const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)```/) || rawContent.match(/({[\s\S]*})/);
                const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();
                classification = JSON.parse(jsonStr);
            }
        } catch (parseErr) {
            console.warn('[api/chat] Classification parse error — using safe defaults:', parseErr);
            classification = { intent: 'OTRO', detected_categories: [], detected_name: undefined, is_negation: false };
        }
        const { intent, detected_categories = [], detected_name, is_negation } = classification;

        // === FALLBACK DE CATEGORÍA POR KEYWORD ===
        // Si el clasificador devuelvió IDs vacíos (frecuente con textos cortos como "depilacion"),
        // buscar la categoría directamente en el nombre de la categoría vs el texto del usuario.
        const effectiveCatIds: string[] = detected_categories.map(String);
        if ((intent === 'CONSULTA_SERVICIO' || intent === 'TURNO') && effectiveCatIds.length === 0) {
            const userNorm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            for (const cat of categories) {
                const catNorm = cat.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                // Coincidencia si el texto incluye el nombre de categoría o alguna palabra clave de ella
                const catWords = catNorm.split(/\s+/).filter((w: string) => w.length > 3);
                if (userNorm.includes(catNorm) || catWords.some((w: string) => userNorm.includes(w))) {
                    effectiveCatIds.push(String(cat.id));
                }
            }
            if (effectiveCatIds.length > 0) {
                console.log(`[api/chat] ETAPA 2/3 keyword fallback detectó categorías: ${effectiveCatIds.join(', ')}`);
            }
        }

        console.log(`[api/chat] INTENT: ${intent} | Cats: ${effectiveCatIds.join(',') || '(ninguna)'} | Name: ${detected_name}`);

        // --- 3. EJECUCIÓN DE ETAPAS ---

        // A) SALUDO (Etapa 0)
        if (intent === 'SALUDO' && !activeLeadId) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "¡Hola! Bienvenida/o a KÂLON Estética ✨. Soy tu asistente virtual. Para empezar, ¿me decís tu nombre y apellido? 😊" } }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // B) CONSULTA DE SERVICIO (Etapa 2 y 3) - DINÁMICO
        let assistantContext = "";
        let receiptUrl = "";
        
        if (intent === 'CONSULTA_SERVICIO' && !is_negation && effectiveCatIds.length > 0) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Accel-Buffering', 'no');

            if (activeLeadId) res.write(`data: ${JSON.stringify({ leadId: activeLeadId })}\n\n`);

            // 1. Buscar servicios específicos — ETAPA 3 (Recibo Dinámico)
            const allServices = await sql`SELECT s.id, s.title, s.price, s.category_id, c.name as category_name 
                FROM services s LEFT JOIN categories c ON s.category_id = c.id 
                WHERE s.active = true`.catch(() => []);
            
            const userTextNorm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            
            const detectedCatIds = new Set(effectiveCatIds);
            const phrases = userTextNorm.split(/\s+y\s+|\s+o\s+|\s+e\s+|,|\.|-|\n/g).map(p => p.trim()).filter(p => p.length > 0);
            
            const expandedServices: any[] = [];
            for (const s of allServices) {
                if (s.title && s.title.includes('(c/u)')) {
                    const parts = s.title.replace('(c/u)', '').split('/').map((p: string) => p.trim());
                    for (const p of parts) {
                        if (p) expandedServices.push({ ...s, originalTitle: s.title, title: p });
                    }
                } else {
                    expandedServices.push({ ...s, originalTitle: s.title });
                }
            }

            expandedServices.sort((a: any, b: any) => {
                const aCat = detectedCatIds.has(String(a.category_id));
                const bCat = detectedCatIds.has(String(b.category_id));
                if (aCat && !bCat) return -1;
                if (!aCat && bCat) return 1;
                return (b.title || '').length - (a.title || '').length;
            });

            const matchedServices = [];
            for (const s of expandedServices) {
                const t = (s.title || '').replace(/^\d+[\s.]*/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                let matchedPhraseIndex = -1;
                for (let i = 0; i < phrases.length; i++) {
                    let phrase = " " + phrases[i] + " ";
                    if (phrase.includes(" " + t + " ") || phrase.includes(t)) {
                        matchedPhraseIndex = i;
                        break;
                    }
                    const significantWords: string[] = Array.from(new Set(t.split(/[\s+/()]+/).filter((w: string) => w.length > 3)));
                    const matchedWords: string[] = significantWords.filter((w: string) => phrase.includes(w) || phrase.includes(w.replace(/s$/, '')));
                    let threshold = significantWords.length === 1 ? 1 : 2;
                    if (t.includes('combo') || t.includes('pack') || t.includes('promo')) threshold = Math.max(threshold, significantWords.length - 1);
                    if (significantWords.length > 0 && matchedWords.length >= threshold) {
                        matchedPhraseIndex = i;
                        break;
                    }
                }
                if (matchedPhraseIndex !== -1) {
                    matchedServices.push(s);
                    phrases[matchedPhraseIndex] = phrases[matchedPhraseIndex].replace(t, " ").trim();
                }
            }

            const deduped = matchedServices.filter((s: any, _i: number, arr: any[]) => {
                const sTitle = (s.title || '').replace(/^\d+[\s.]*/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                const sWords = sTitle.split(/[\s+/()]+/).filter((w: string) => w.length > 3).sort().join(' ');
                return !arr.some((other: any) => {
                    if (other.id === s.id && other.title === s.title) return false;
                    const otherTitle = (other.title || '').replace(/^\d+[\s.]*/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const otherWords = otherTitle.split(/[\s+/()]+/).filter((w: string) => w.length > 3).sort().join(' ');
                    if (sWords === otherWords && sWords.length > 0) return s.id > other.id;
                    return false;
                });
            });

            const { updateLeadState } = await import('./_services/db.js');
            if (deduped.length > 0) {
                const receiptItems = deduped.map((s: any) => ({ 
                    label: (s.title || '').replace(/^\d+[\s.]*/, ''), 
                    price: `$${Number(s.price).toLocaleString('es-AR')}` 
                }));
                const totalPrice = deduped.reduce((acc: number, s: any) => acc + Number(s.price), 0);
                receiptItems.push({ label: 'TOTAL ESTIMADO', price: `$${totalPrice.toLocaleString('es-AR')}` });
                const satoriData = Buffer.from(JSON.stringify(receiptItems)).toString('base64');
                receiptUrl = `https://kalon-estetica.vercel.app/api/satori-image?title=${encodeURIComponent('TU PRESUPUESTO KÂLON')}&data=${satoriData}`;
                res.write(`data: ${JSON.stringify({ media_url: receiptUrl })}\n\n`);
                assistantContext = `RECIBO ENVIADO. Servicios: ${deduped.map((s: any) => `${s.title}: $${Number(s.price).toLocaleString('es-AR')}`).join(', ')}. TOTAL REAL: $${totalPrice.toLocaleString('es-AR')}.`;
                
                if (activeLeadId) await updateLeadState(String(activeLeadId), { ...currentState, stage: '3', selectedServiceIds: deduped.map(s => String(s.id)) });
            } else {
                const matchedCats = categories.filter(c => detectedCatIds.has(String(c.id)));
                for (const cat of matchedCats) {
                    if (cat.price_list_url) res.write(`data: ${JSON.stringify({ media_url: cat.price_list_url })}\n\n`);
                }
                const catNames = matchedCats.map(c => `**${c.name}**`).join(' y ');
                assistantContext = `El usuario solicitó información sobre: ${catNames}. Ya le enviamos las imágenes de los precios correspondientes.`;
                
                if (activeLeadId) await updateLeadState(String(activeLeadId), { ...currentState, stage: '2', currentCategoryId: String(matchedCats[0]?.id || '') });
            }
        }

        // C) REGISTRO (Etapa 1) - PRIORIDAD ABSOLUTA
        // Extrae nombre de frases como "Hola soy María López" o "Me llamo Valentina"
        const extractNameFromPhrase = (t: string): string | null => {
            const match = t.match(/(?:soy|me\s+llamo|mi\s+nombre\s+es)\s+([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+)*)/i);
            if (match) return match[1].trim();
            return null;
        };
        const extractedName = extractNameFromPhrase(text);

        // BLINDAJE: Si no hay lead y el texto parece un nombre, registrar SIN depender del clasificador
        const looksLikeName = !activeLeadId && 
            intent !== 'CONSULTA_SERVICIO' && intent !== 'TURNO' &&
            text.split(/\s+/).length >= 2 && 
            text.length > 3 && text.length < 60 &&
            !/\d/.test(text) && 
            !/^(hola|buen|quiero|necesito|me |tengo|cuanto|cual|que |como|donde|cuando|hay |si |no |tene|tiene|puede|puedo|quisiera|queria|podria|agenda|reserv|turno|cita|horario|disponib|cancel|modific|cambi|para |ya |estoy|dale|ok|listo|perfect|gracia|chau|bye|adios|info|precio|servicio)/i.test(text) &&
            !/turno|cita|agendar|reservar|horario|disponib|cancelar|fecha|hora /i.test(text) &&
            !/ceja|pestaña|pestana|depilac|masaje|limpieza|facial|manicuria|pedicuria|kapping|esculpida|reiki|podolog|psicolog|cavado|bozo|axila|gluteo|brazo|pierna|lifting|perfilado|laminado|dermaplaning|peeling|uñas/i.test(text);
        
        // Prioridad: nombre extraído de frase > nombre detectado por IA > texto literal si parece nombre
        const nameForRegistration = extractedName || detected_name || (looksLikeName ? text : null);
        
        if (!activeLeadId && nameForRegistration && detected_categories.length === 0) {
            console.log('[api/chat] FLOW: Registrando nuevo lead (Etapa 1)...');
            const configRows = await sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []);
            const mainImageUrl = configRows?.[0]?.value || 'https://ijltsqfshvunmngvbeue.supabase.co/storage/v1/object/public/kalon-services/CATALOGO%20KALON.png';

            const newLead = await createLead(null, nameForRegistration!, { 
                phone: null,
                source: "chatbot_web", 
                initId: String(identificationId || '') 
            }).catch(() => null);
            
            const finalLeadId = newLead?.id || `temp_${Date.now()}`;
            
            // Actualizar a Etapa 2
            const { updateLeadState } = await import('./_services/db.js');
            await updateLeadState(String(finalLeadId), { stage: '2', clientName: nameForRegistration });

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Accel-Buffering', 'no');
            
            res.write(`data: ${JSON.stringify({ leadId: finalLeadId })}\n\n`);
            res.write(`data: ${JSON.stringify({ media_url: mainImageUrl })}\n\n`);
            
            const welcomeMsg = `¡Un gusto conocerte, ${nameForRegistration}! ✨ Te dejo nuestro catálogo arriba para que lo veas. Contame, ¿qué servicio o tratamiento te interesa hoy?`;
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: welcomeMsg } }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // Obtenemos el nombre real del lead para evitar confusiones de identidad
        const currentLeadName = leadByInitId?.client_name || detected_name || 'cliente';

        // D) TURNO / AGENDA (Etapa 4)
        if (intent === 'TURNO' && activeLeadId) {
            console.log('[api/chat] FLOW: Etapa 4 — Solicitud de turno');
            
            const { getAvailableSlotsFromDB, updateLeadState } = await import('./_services/db.js');
            const now = new Date();
            const startDate = new Date(now.getTime());
            const ms = 1000 * 60 * 30;
            startDate.setTime(Math.ceil(startDate.getTime() / ms) * ms);
            
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 7);
            
            let targetCatId = detected_categories?.[0] ? String(detected_categories[0]) : (currentState.currentCategoryId || '');
            if (!targetCatId) {
                const fullHistoryNorm = messages.slice(-6).map(m => m.content).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                for (const c of categories) {
                    const cNameNorm = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    if (fullHistoryNorm.includes(cNameNorm) || (c.name === 'Depilación' && fullHistoryNorm.includes('depilac')) || (c.name === 'Pestañas' && (fullHistoryNorm.includes('pestañ') || fullHistoryNorm.includes('laminado') || fullHistoryNorm.includes('ceja')))) {
                        targetCatId = String(c.id);
                        break;
                    }
                }
            }

            const apptsPromise = sql`
                SELECT id, date_time, service_type, status 
                FROM appointments 
                WHERE lead_id = ${activeLeadId}::uuid 
                AND status NOT IN ('canceled', 'CANCELADA')
                ORDER BY date_time DESC LIMIT 5
            `.catch(() => []);

            const slotsPromise = targetCatId 
                ? getAvailableSlotsFromDB(targetCatId, startDate, endDate, 30).catch(() => [])
                : Promise.resolve([]);

            const [existingAppts, slots] = await Promise.all([apptsPromise, slotsPromise]);
            const upcomingAppts = existingAppts.filter((a: any) => new Date(a.date_time) >= new Date());
            
            let turnoContext = `ETAPA 4 — GESTIÓN DE TURNOS.\n`;
            if (upcomingAppts.length > 0) {
                turnoContext += `TURNOS PRÓXIMOS: ${upcomingAppts.map((a: any) => 
                    `${a.service_type} el ${new Date(a.date_time).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })} a las ${new Date(a.date_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })} (${a.status})`
                ).join('; ')}\n`;
            }
            
            turnoContext += `HORARIO DE ATENCIÓN: Lunes a Viernes 9:00 a 20:00, Sábados 9:00 a 14:00.\n`;
            
            if (slots.length > 0) {
                const slotsByDay = new Map<string, string[]>();
                const formatter = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' });
                const timeFormatter = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
                
                for (const slot of slots) {
                    const dt = new Date(slot.slot_time);
                    const dayKey = formatter.format(dt);
                    if (!slotsByDay.has(dayKey)) slotsByDay.set(dayKey, []);
                    const daySlots = slotsByDay.get(dayKey)!;
                    if (daySlots.length < 20) daySlots.push(timeFormatter.format(dt));
                }
                
                const daysToShow = Array.from(slotsByDay.entries()).slice(0, 4);
                turnoContext += `DISPONIBILIDAD REAL:\n`;
                for (const [day, times] of daysToShow) {
                    turnoContext += `- ${day}: ${times.join(', ')}.\n`;
                }
            } else {
                turnoContext += `DISPONIBILIDAD: Tenemos turnos disponibles esta semana. Preguntale al cliente qué día y horario le viene mejor.\n`;
            }
            
            turnoContext += `INSTRUCCIONES CRÍTICAS ETAPA 4: 
            1. SÉ EXTREMADAMENTE PROACTIVO. Ofrecé 3 alternativas reales.
            2. NO digas "dejame verificar".
            3. Confirmá siempre: servicio, día y hora.
            4. REGLA ESTRICTA: NUNCA des consejos médicos.`;

            // === ETAPA 5 DETECTOR ===
            const lastBotMsgLower = lastBotMsg.toLowerCase();
            const botOfferedSlots = /(ma[ñn]ana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|hoy|disponible|libre)/i.test(lastBotMsgLower)
                && (lastBotMsgLower.includes(' hs') || lastBotMsgLower.includes(':') || lastBotMsgLower.includes('las '));
            
            const userPickedSlot = /(?:para\s+)?(ma[ñn]ana|hoy|el\s+\w+)|a las \d{1,2}|ese\s+horario|esa\s+hora|me\s+queda|de\s+acuerdo|dale[!.]?$|listo[!.]?$|perfecto[!.]?$|s[ií][,!.]?\s*(dale|ese|eso|me)|entonces|ok|est[aá]\s+bien|confirm/i.test(text.toLowerCase());

            if (botOfferedSlots && userPickedSlot) {
                console.log('[api/chat] *** ETAPA 5 DETECTADA ***');
                turnoContext = `ETAPA 5 — CLIENTE CONFIRMÓ HORARIO: "${text}"\n`;
                turnoContext += `1. Decile que el horario queda PRE-RESERVADO.\n2. Pedile su WhatsApp.\n3. Pedile el comprobante de seña del 50%.\n`;
                await updateLeadState(String(activeLeadId), { ...currentState, stage: '5' });
            } else if (currentStage !== '4') {
                await updateLeadState(String(activeLeadId), { ...currentState, stage: '4' });
            }

            assistantContext = turnoContext;
        }

        // --- ETAPA 5 & 6: INTERCEPTOR DE SEÑA Y AGENDAMIENTO AUTOMÁTICO ---
        const isWaitingForDeposit = currentStage === '5' || lastBotMsg.includes('pre-reservado') || lastBotMsg.includes('comprobante') || lastBotMsg.includes('WhatsApp') || lastBotMsg.includes('seña');
        const hasMedia = !!mediaUrl || text.includes('📸') || /comprobante|transfer|pago|recibo|adjunt|listo/i.test(text);

        if (activeLeadId && isWaitingForDeposit && hasMedia) {
            console.log('[api/chat] FLOW: Etapa 6 — Verificación de Comprobante');
            
            const phoneMatch = text.match(/\b(?:54\s*9\s*)?(?:11|[2-9]\d{2})[-.\s]?\d{3}[-.\s]?\d{4}\b|\b\d{10}\b|\b\d{8,12}\b/);
            const extractedPhone = phoneMatch ? phoneMatch[0].trim() : (currentState.clientPhone || null);

            if (!extractedPhone && !leadByInitId?.phone) {
                assistantContext = `¡Gracias por el comprobante! 📸 Lo he recibido. Para finalizar el agendamiento, por favor **escribí tu número de WhatsApp** aquí mismo.`;
            } else {
                try {
                    const { db, schema, createAppointment, updateLeadState } = await import('./_services/db.js');
                    const { eq } = await import('drizzle-orm');
                    
                    const finalPhone = extractedPhone || leadByInitId?.phone;
                    if (finalPhone) {
                        try {
                            await db.update(schema.leads)
                                .set({ phone: finalPhone, contact_info: { ...currentState, phone: finalPhone, source: "chatbot", initId: String(identificationId || '') } })
                                .where(eq(schema.leads.id, activeLeadId));
                        } catch (e) {}
                    }
                    
                    const catNamesForAppt = detected_categories.length > 0 ? detected_categories.join(', ') : (currentState.selectedServiceIds?.join(', ') || 'Servicios Kâlon');
                    const recentMsgs = messages.slice(-8).map((m: any) => m.content || '').join(' ');
                    
                    const isoDateMatch = recentMsgs.match(/(\d{4}-\d{2}-\d{2})/);
                    const timeMatch = recentMsgs.match(/(\d{1,2}):(\d{2})\s*hs?/i);
                    const relativeDateStr = !isoDateMatch ? parseRelativeDate(recentMsgs, new Date()) : null;
                    const resolvedDateStr = isoDateMatch?.[1] || relativeDateStr;

                    let appointmentDateTime: Date;
                    if (resolvedDateStr && timeMatch) {
                        const [_, hour, minute] = timeMatch;
                        appointmentDateTime = new Date(`${resolvedDateStr}T${hour.padStart(2,'0')}:${minute}:00-03:00`);
                    } else {
                        appointmentDateTime = new Date();
                        appointmentDateTime.setDate(appointmentDateTime.getDate() + 1);
                        appointmentDateTime.setHours(10, 0, 0, 0);
                    }

                    const priceMatch = assistantContext.match(/TOTAL REAL:\s*\$?([\d.,]+)/);
                    const realPrice = priceMatch ? Number(priceMatch[1].replace(/\./g, '').replace(',', '.')) : 0;

                    await createAppointment(
                        String(activeLeadId),
                        null,
                        appointmentDateTime.toISOString(),
                        catNamesForAppt,
                        realPrice,
                        60,
                        [],
                        null
                    );

                    await updateLeadState(String(activeLeadId), { ...currentState, stage: '6', clientPhone: finalPhone });

                    console.log(`[api/chat] Turno confirmado (Etapa 6) para Lead ${activeLeadId}`);
                    assistantContext = `PAGO Y WHATSAPP RECIBIDOS. El turno ha sido agendado y confirmado exitosamente en Kâlon Estética.`;
                } catch (apptErr) {
                    console.warn('[api/chat] Error en Etapa 6:', apptErr);
                    assistantContext = `Reci        // E) IA CONVERSACIONAL (Refinado por Etapa)
        console.log(`[api/chat] STREAMING — Etapa Actual: ${currentStage}`);

        const stream = await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash',
            messages: [
                { 
                    role: 'system', 
                    content: `## IDENTIDAD KÂLON
Sos KÂLON, la asistente boutique de "Kâlon Estética Avanzada" en Córdoba, Argentina.
Hablás con elegancia, calidez extrema y voseo cordobés (usá "vos", "te", "tu").

## ESTADO DEL LEAD
Nombre: ${currentLeadName}.
Etapa Actual: ${currentStage}.
${assistantContext ? `Contexto Operacional: ${assistantContext}` : ''}

## REGLAS POR ETAPA
- ETAPA 1 (Registro): Pedí nombre y apellido si no lo tenés.
- ETAPA 2 (Catálogo): Ofrecé servicios y mostrá precios.
- ETAPA 3 (Presupuesto): Confirmá servicios y enviá recibo visual.
- ETAPA 4 (Agenda): Ofrecé horarios reales del contexto.
- ETAPA 5 (Pre-reserva): Pedí WhatsApp y comprobante de seña del 50%.
- ETAPA 6 (Confirmación): Felicitá y confirmá que el turno ya está en el sistema.

## REGLAS CRÍTICAS
- NUNCA des consejos médicos ni preparación para tratamientos.
- NUNCA menciones errores técnicos o APIs.
- Sé concisa (máx 3-4 oraciones).
- Siempre cerrá con una pregunta proactiva.`
                },
                ...messages.map((m) => ({ role: m.role as any, content: m.content }))
            ],
            stream: true,
        }, { timeout: 15000 });

        if (!res.headersSent) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Accel-Buffering', 'no');
        }
        
        if (activeLeadId) res.write(`data: ${JSON.stringify({ leadId: activeLeadId })}\n\n`);

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        return res.end();

    } catch (e: any) {
        console.error('[api/chat] ERROR:', e.message);
        if (!res.headersSent) {
            res.status(500).json({ error: e.message });
        } else {
            res.end();
        }
    }
}
