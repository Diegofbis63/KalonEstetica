import OpenAI from 'openai';
import { 
    createLead, 
    sql, 
    getCategories, 
    getServicesByCategory, 
    findLeadByInitId, 
    updateLeadState, 
    saveChatHistory,
    createAppointment,
    getAvailableSlotsFromDB
} from './_services/db.js';
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
        const effectiveCatIds: string[] = detected_categories.map(String);
        if ((intent === 'CONSULTA_SERVICIO' || intent === 'TURNO') && effectiveCatIds.length === 0) {
            const userNorm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            for (const cat of categories) {
                const catNorm = cat.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const catWords = catNorm.split(/\s+/).filter((w: string) => w.length > 3);
                if (userNorm.includes(catNorm) || catWords.some((w: string) => userNorm.includes(w))) {
                    effectiveCatIds.push(String(cat.id));
                }
            }
        }

        console.log(`[api/chat] STATE: ${currentStage} | INTENT: ${intent} | Cats: ${effectiveCatIds.join(',') || '(none)'}`);

        // --- 3. MÁQUINA DE ESTADOS LINEAL (BLOQUEO DE ETAPAS) ---
        let assistantContext = "";
        let receiptUrl = "";

        // ETAPA 1: REGISTRO
        if (currentStage === '1') {
            const extractNameFromPhrase = (t: string): string | null => {
                const match = t.match(/(?:soy|me\s+llamo|mi\s+nombre\s+es)\s+([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+)*)/i);
                if (match) return match[1].trim();
                return null;
            };
            const extractedName = extractNameFromPhrase(text);
            const looksLikeName = !activeLeadId && text.split(/\s+/).length >= 2 && text.length > 3 && text.length < 60 && !/\d/.test(text) && 
                !/^(hola|buen|quiero|necesito|info|precio|turno)/i.test(text);
            
            const nameForRegistration = extractedName || detected_name || (looksLikeName ? text : null);

            if (nameForRegistration) {
                console.log('[api/chat] TRANSITION: 1 -> 2 (Registro)');
                const configRows = await sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []);
                const mainImageUrl = configRows?.[0]?.value || 'https://ijltsqfshvunmngvbeue.supabase.co/storage/v1/object/public/kalon-services/CATALOGO%20KALON.png';

                const newLead = await createLead(null, nameForRegistration, { 
                    phone: null,
                    source: "chatbot_web", 
                    initId: String(identificationId || '') 
                });
                
                activeLeadId = newLead?.id || null;
                if (activeLeadId) {
                    await updateLeadState(String(activeLeadId), { stage: '2', clientName: nameForRegistration });
                    currentStage = '2';
                    assistantContext = `SISTEMA: El lead se ha registrado como ${nameForRegistration} y ya se le envió la imagen del catálogo principal. SALUDALO y preguntale qué servicio de los que ve en la imagen le interesa.`;
                    
                    if (!res.headersSent) {
                        res.setHeader('Content-Type', 'text/event-stream');
                        res.setHeader('Cache-Control', 'no-cache');
                        res.setHeader('X-Accel-Buffering', 'no');
                    }
                    res.write(`data: ${JSON.stringify({ leadId: activeLeadId })}\n\n`);
                    res.write(`data: ${JSON.stringify({ media_url: mainImageUrl })}\n\n`);
                }
            }
        }
        // ETAPA 2 & 3: CATÁLOGO Y PRESUPUESTO
        else if ((currentStage === '2' || currentStage === '3') && intent === 'CONSULTA_SERVICIO' && effectiveCatIds.length > 0) {
            console.log('[api/chat] TRANSITION: Stage 3 (Presupuesto)');
            
            const allServices = await sql`SELECT s.id, s.title, s.price, s.category_id, c.name as category_name 
                FROM services s LEFT JOIN categories c ON s.category_id = c.id 
                WHERE s.active = true`.catch(() => []);
            
            const userTextNorm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const detectedCatIds = new Set(effectiveCatIds);
            
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

            const matchedServices = [];
            for (const s of expandedServices) {
                const t = (s.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                // Match si el texto del usuario contiene el título O si el título contiene alguna palabra clave importante del usuario
                if (userTextNorm.includes(t) || (t.length > 3 && userTextNorm.includes(t.substring(0, Math.min(t.length, 10))))) {
                    matchedServices.push(s);
                }
            }

            if (matchedServices.length > 0) {
                const receiptItems = matchedServices.map((s: any) => ({ 
                    label: s.title, 
                    price: `$${Number(s.price).toLocaleString('es-AR')}` 
                }));
                const totalPrice = matchedServices.reduce((acc: number, s: any) => acc + Number(s.price), 0);
                receiptItems.push({ label: 'TOTAL ESTIMADO', price: `$${totalPrice.toLocaleString('es-AR')}` });
                const satoriData = Buffer.from(JSON.stringify(receiptItems)).toString('base64');
                receiptUrl = `https://kalon-estetica.vercel.app/api/satori-image?title=${encodeURIComponent('TU PRESUPUESTO KÂLON')}&data=${satoriData}`;
                
                res.setHeader('Content-Type', 'text/event-stream');
                res.write(`data: ${JSON.stringify({ media_url: receiptUrl })}\n\n`);
                assistantContext = `PRESUPUESTO GENERADO. Servicios: ${matchedServices.map(s => s.title).join(', ')}. Total: $${totalPrice}.`;
                
                if (activeLeadId) {
                    await updateLeadState(String(activeLeadId), { ...currentState, stage: '3', selectedServiceIds: matchedServices.map(s => String(s.id)) });
                    currentStage = '3';
                }
            } else {
                const matchedCats = categories.filter(c => detectedCatIds.has(String(c.id)));
                for (const cat of matchedCats) {
                    if (cat.price_list_url) {
                        if (!res.headersSent) {
                            res.setHeader('Content-Type', 'text/event-stream');
                        }
                        res.write(`data: ${JSON.stringify({ media_url: cat.price_list_url })}\n\n`);
                    }
                }
                assistantContext = `SISTEMA: No se detectó un servicio específico, pero sí las categorías: ${matchedCats.map(c => c.name).join(', ')}. Ya se enviaron las imágenes de catálogo. Invitá al cliente a revisarlas y preguntale qué tratamiento específico de esas áreas le gustaría realizarse.`;
                if (activeLeadId) await updateLeadState(String(activeLeadId), { ...currentState, stage: '2', currentCategoryId: String(matchedCats[0]?.id || '') });
                currentStage = '2';
            }
        }
        // ETAPA 4: AGENDA (Solo si viene de 3 o ya está en 4)
        else if ((currentStage === '3' || currentStage === '4') && (intent === 'TURNO' || /turno|cita|agendar/i.test(text))) {
            console.log('[api/chat] TRANSITION: Stage 4 (Agenda)');
            
            const now = new Date();
            const startDate = new Date(now.getTime());
            startDate.setHours(startDate.getHours() + 2); 
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 7);
            
            let targetCatId = effectiveCatIds[0] || currentState.currentCategoryId || '';
            const slots = targetCatId ? await getAvailableSlotsFromDB(targetCatId, startDate, endDate, 30).catch(() => []) : [];
            
            if (slots.length > 0) {
                assistantContext = `DISPONIBILIDAD PARA ${targetCatId}: Encontrados ${slots.length} turnos. Ofrecer 3 opciones claras.`;
            } else {
                assistantContext = `SIN SLOTS EN DB. Pedir al usuario que sugiera día y hora para consultar manualmente.`;
            }

            if (activeLeadId) {
                await updateLeadState(String(activeLeadId), { ...currentState, stage: '4' });
                currentStage = '4';
            }
        }
        // ETAPA 5: PRE-RESERVA (Solo si viene de 4 o ya está en 5)
        else if (currentStage === '5' || (/dale|perfecto|ok|esa hora|ese horario|me queda bien|confirm/i.test(text.toLowerCase()) && currentStage === '4')) {
            console.log('[api/chat] TRANSITION: Stage 5 (Pre-reserva)');
            if (activeLeadId && currentStage === '4') {
                await updateLeadState(String(activeLeadId), { ...currentState, stage: '5' });
            }
            currentStage = '5';
            assistantContext = `ESPERANDO SEÑA (50%) Y WHATSAPP. Recordar al cliente que el turno es pre-reservado hasta recibir el comprobante.`;
        }
        // ETAPA 6: CONFIRMACIÓN
        else if (currentStage === '5' && (!!mediaUrl || /comprobante|transferencia|pago|adjunto/i.test(text.toLowerCase()))) {
            console.log('[api/chat] TRANSITION: Stage 6 (Confirmación)');
            const phoneMatch = text.match(/\d{8,12}/);
            const finalPhone = phoneMatch ? phoneMatch[0] : (currentState.clientPhone || null);

            if (activeLeadId) {
                await createAppointment(String(activeLeadId), null, new Date().toISOString(), "Servicio Confirmado", 0, 60, []).catch(() => null);
                await updateLeadState(String(activeLeadId), { ...currentState, stage: '6', clientPhone: finalPhone });
                currentStage = '6';
                assistantContext = `TURNO CONFIRMADO EXITOSAMENTE. Fin del flujo.`;
            }
        }
        const currentLeadName = leadByInitId?.client_name || 'cliente';

        // --- 4. IA CONVERSACIONAL (Refinado por Etapa) ---
        console.log(`[api/chat] STREAMING — Etapa Final: ${currentStage}`);

        const stream = await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash',
            messages: [
                { 
                    role: 'system', 
                    content: `## IDENTIDAD KÂLON
Sos KÂLON, la asistente boutique de "Kâlon Estética Avanzada" en Córdoba. Hablás con elegancia, calidez y voseo cordobés.

## ESTADO DEL LEAD
Nombre: ${currentLeadName}.
Etapa Actual: ${currentStage}.
${assistantContext ? `Contexto Operacional: ${assistantContext}` : ''}

## REGLAS CRÍTICAS POR ETAPA
- ETAPA 1: Solo pedí nombre y apellido para comenzar.
- ETAPA 2: El sistema YA ENVIÓ el catálogo (imagen). Invitá al cliente a verlo y preguntale qué servicio específico le interesa. NO vuelvas a pedir el nombre.
- ETAPA 3: El sistema YA ENVIÓ el presupuesto (imagen). Preguntale si los valores le parecen bien y si quiere que busquemos un turno.
- ETAPA 4: Ofrecé 3 horarios reales según el contexto y pedí que elija uno.
- ETAPA 5: Pedí el WhatsApp para el recordatorio y recordá que debe enviar el comprobante de seña para congelar el turno.
- ETAPA 6: Confirmá que el turno quedó agendado y despedite con elegancia.

## REGLAS GENERALES
- NUNCA des consejos médicos.
- NUNCA menciones APIs o errores técnicos.
- Sé concisa (máx 3 oraciones).
- Siempre cerrá con una pregunta proactiva que empuje a la siguiente etapa.`
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
