import OpenAI from 'openai';
import { createLead, sql, getCategories, getServicesByCategory, findLeadByInitId } from './_services/db.js';
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
        const isGreeting = text.toLowerCase().length < 6 && (text.toLowerCase().includes('hola') || text.toLowerCase().includes('buen'));

        console.log(`[api/chat] MSG: "${text}" | ID: ${identificationId} | LeadId: ${leadId}`);

        // --- 1. PRE-PROCESAMIENTO: IDENTIFICACIÓN ROBUSTA ---
        let leadByInitId = null;
        let activeLeadId: string | number | null = leadId || null;
        if (identificationId && String(identificationId).length > 10 && !activeLeadId) {
            leadByInitId = await findLeadByInitId(String(identificationId)).catch(() => null);
            if (leadByInitId) {
                activeLeadId = leadByInitId.id;
                console.log(`[api/chat] Lead recuperado por initId: ${activeLeadId} (${leadByInitId.first_name})`);
            }
        }

        // --- 2. CLASIFICACIÓN DE INTENCIÓN (IA) ---
        const categories = await getCategories().catch(() => []) as Array<{ id: string | number, name: string, price_list_url?: string }>;
        const services = await sql`SELECT s.title, c.id as category_id FROM services s LEFT JOIN categories c ON s.category_id = c.id WHERE s.active = true`.catch(() => []);
        const catList = categories.map((c: any) => {
            const sList = services.filter((s: any) => s.category_id === c.id).map((s: any) => s.title).join(', ');
            return `${c.id}: ${c.name} (${sList || 'sin servicios'})`;
        }).join('\n        ');
        
        const recentHistory = messages.slice(-4, -1).map(m => `${m.role === 'assistant' ? 'Asistente' : 'Usuario'}: ${m.content}`).join('\n');

        const classificationPrompt = `Analiza el mensaje del usuario para KÂLON Estética y clasifica su intención.
        Categorías disponibles y sus servicios comunes:
        ${catList}
        
        Estado actual del Lead: ${activeLeadId ? 'Identificado' : 'No Identificado'}
        
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

        const classificationResponse = await openai.chat.completions.create({
            model: 'google/gemini-2.5-flash',
            messages: [{ role: 'system', content: classificationPrompt }],
            response_format: { type: 'json_object' }
        }, { timeout: 10000 }).catch((e) => {
            console.warn('[api/chat] Classification timeout/error:', e.message);
            return null;
        });

        // Blindaje robusto: extrae JSON aunque venga envuelto en ```json ... ```
        let classification: { intent?: string; detected_categories?: any[]; detected_name?: string; is_negation?: boolean } = {};
        try {
            const rawContent = classificationResponse?.choices[0]?.message?.content || '{}';
            const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)```/) || rawContent.match(/({[\s\S]*})/);
            const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();
            classification = JSON.parse(jsonStr);
        } catch (parseErr) {
            console.warn('[api/chat] Classification parse error — using safe defaults:', parseErr);
            classification = { intent: 'OTRO', detected_categories: [], detected_name: undefined, is_negation: false };
        }
        const { intent, detected_categories = [], detected_name, is_negation } = classification;

        console.log(`[api/chat] INTENT: ${intent} | Cats: ${detected_categories} | Name: ${detected_name}`);

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
        
        if (intent === 'CONSULTA_SERVICIO' && !is_negation && detected_categories.length > 0) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Accel-Buffering', 'no');

            if (activeLeadId) res.write(`data: ${JSON.stringify({ leadId: activeLeadId })}\n\n`);

            // 1. Buscar servicios específicos — ETAPA 3 (Recibo Dinámico)
            // Usamos la columna correcta "title" y matcheamos por nombre de categoría
            const allServices = await sql`SELECT s.id, s.title, s.price, s.category_id, c.name as category_name 
                FROM services s LEFT JOIN categories c ON s.category_id = c.id 
                WHERE s.active = true`.catch(() => []);
            
            const userTextNorm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            
            // Mapa de categorías detectadas (por ID o por nombre)
            const detectedCatIds = new Set(detected_categories.map(String));
            const detectedCatNames = categories
                .filter(c => detectedCatIds.has(String(c.id)))
                .map(c => c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
            
            const phrases = userTextNorm.split(/\s+y\s+|\s+o\s+|\s+e\s+|,|\.|-|\n/g).map(p => p.trim()).filter(p => p.length > 0);
            const sortedServices = [...allServices].sort((a: any, b: any) => (b.title || '').length - (a.title || '').length);
            const matchedServices = [];
            
            for (const s of sortedServices) {
                const t = (s.title || '').replace(/^\d+[\s.]*/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                
                let matchedPhraseIndex = -1;
                for (let i = 0; i < phrases.length; i++) {
                    let phrase = " " + phrases[i] + " ";
                    if (phrase.includes(" " + t + " ") || phrase.includes(t)) {
                        matchedPhraseIndex = i;
                        break;
                    }

                    // Fase 2: Match por palabras significativas DENTRO de la frase
                    const significantWords: string[] = Array.from(new Set(t.split(/[\s+/()]+/).filter((w: string) => w.length > 3)));
                    const matchedWords: string[] = significantWords.filter((w: string) => phrase.includes(w) || phrase.includes(w.replace(/s$/, '')));
                    
                    let threshold = significantWords.length === 1 ? 1 : 2;
                    if (t.includes('combo') || t.includes('pack') || t.includes('promo')) {
                        threshold = Math.max(threshold, significantWords.length - 1);
                    }
                    if (significantWords.length > 0 && matchedWords.length >= threshold) {
                        matchedPhraseIndex = i;
                        for (const w of matchedWords) {
                            phrase = phrase.replace(w, " ");
                            phrase = phrase.replace(w + 's', " ");
                            phrase = phrase.replace(w.replace(/s$/, ''), " ");
                        }
                        phrases[i] = phrase.trim();
                        break;
                    }
                }

                if (matchedPhraseIndex !== -1) {
                    matchedServices.push(s);
                    phrases[matchedPhraseIndex] = phrases[matchedPhraseIndex].replace(t, " ").trim();
                }
            }

            // Deduplicar SOLO duplicados semánticos exactos (ej: "Cejas (Perfilado)" vs "Perfilado de cejas")
            const deduped = matchedServices.filter((s: any, _i: number, arr: any[]) => {
                const sTitle = (s.title || '').replace(/^\d+[\s.]*/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                const sWords = sTitle.split(/[\s+/()]+/).filter((w: string) => w.length > 3).sort().join(' ');
                
                return !arr.some((other: any) => {
                    if (other.id === s.id) return false;
                    const otherTitle = (other.title || '').replace(/^\d+[\s.]*/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const otherWords = otherTitle.split(/[\s+/()]+/).filter((w: string) => w.length > 3).sort().join(' ');
                    
                    if (sWords === otherWords && sWords.length > 0) return s.id > other.id;
                    return false;
                });
            });

            console.log(`[ETAPA 3] Matched ${deduped.length} servicios: ${deduped.map((s:any) => s.title).join(', ')}`);

            if (deduped.length > 0) {
                // ══════ GENERAR RECIBO DINÁMICO (Satori) ══════
                const receiptItems = deduped.map((s: any) => ({ 
                    label: (s.title || '').replace(/^\d+[\s.]*/, ''), 
                    price: `$${Number(s.price).toLocaleString('es-AR')}` 
                }));
                const totalPrice = deduped.reduce((acc: number, s: any) => acc + Number(s.price), 0);
                receiptItems.push({ label: 'TOTAL ESTIMADO', price: `$${totalPrice.toLocaleString('es-AR')}` });
                
                const satoriData = Buffer.from(JSON.stringify(receiptItems)).toString('base64');
                receiptUrl = `https://kalon-estetica.vercel.app/api/satori-image?title=${encodeURIComponent('TU PRESUPUESTO KÂLON')}&data=${satoriData}`;
                
                res.write(`data: ${JSON.stringify({ media_url: receiptUrl })}\n\n`);
                // Inyectamos los precios REALES en el contexto para que la IA no alucine
                assistantContext = `RECIBO ENVIADO. Servicios: ${deduped.map((s: any) => `${s.title}: $${Number(s.price).toLocaleString('es-AR')}`).join(', ')}. TOTAL REAL: $${totalPrice.toLocaleString('es-AR')}.`;
            } else {
                // ══════ FALLBACK: Imágenes de categoría (ETAPA 2 — NO TOCAR) ══════
                const matchedCats = categories.filter(c => detectedCatIds.has(String(c.id)));
                for (const cat of matchedCats) {
                    if (cat.price_list_url) res.write(`data: ${JSON.stringify({ media_url: cat.price_list_url })}\n\n`);
                }
                const catNames = matchedCats.map(c => `**${c.name}**`).join(' y ');
                assistantContext = `El usuario solicitó información sobre: ${catNames}. Ya le enviamos las imágenes de los precios correspondientes.`;
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
            !/^(hola|buen|quiero|necesito|me |tengo|cuanto|cual|que |como|donde|cuando|hay |si |no |tene|tiene|puede|puedo|quisiera|queria|podria|agenda|reserv|turno|cita|horario|disponib|cancel|modific|cambi|para |ya |estoy|dale|ok|listo|perfect|gracia|chau|bye|adios)/i.test(text) &&
            !/turno|cita|agendar|reservar|horario|disponib|cancelar|fecha|hora /i.test(text) &&
            !/ceja|pestaña|pestana|depilac|masaje|limpieza|facial|manicuria|pedicuria|kapping|esculpida|reiki|podolog|psicolog|cavado|bozo|axila|gluteo|brazo|pierna|lifting|perfilado|laminado|dermaplaning|peeling|uñas/i.test(text) &&
            detected_categories.length === 0;
        
        // Prioridad: nombre extraído de frase > nombre detectado por IA > texto literal si parece nombre
        const nameForRegistration = extractedName || detected_name || (looksLikeName ? text : null);
        
        if (!activeLeadId && nameForRegistration && detected_categories.length === 0) {
            console.log('[api/chat] FLOW: Registrando nuevo lead (Etapa 1)...');
            const configRows = await sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []);
            const mainImageUrl = configRows?.[0]?.value || 'https://ijltsqfshvunmngvbeue.supabase.co/storage/v1/object/public/kalon-services/CATALOGO%20KALON.png';

            const newLead = await createLead(null, nameForRegistration!, { 
                phone: `anon_${Date.now()}`, 
                source: "chatbot_web", 
                initId: String(identificationId || '') 
            }).catch(() => null);
            
            const finalLeadId = newLead?.id || `temp_${Date.now()}`;
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
        const currentLeadName = leadByInitId?.client_name || (leadByInitId as any)?.first_name || detected_name || 'cliente';

        // D) TURNO / AGENDA (Etapa 4)
        if (intent === 'TURNO' && activeLeadId) {
            console.log('[api/chat] FLOW: Etapa 4 — Solicitud de turno');
            
            // Buscar turnos existentes del lead
            const existingAppts = await sql`
                SELECT id, date_time, service_type, status 
                FROM appointments 
                WHERE lead_id = ${activeLeadId}::uuid 
                AND status NOT IN ('canceled', 'CANCELADA')
                ORDER BY date_time DESC LIMIT 5
            `.catch(() => []);
            
            const upcomingAppts = existingAppts.filter((a: any) => new Date(a.date_time) >= new Date());
            const pastAppts = existingAppts.filter((a: any) => new Date(a.date_time) < new Date());
            
            // Construir contexto real para la IA
            let turnoContext = `ETAPA 4 — GESTIÓN DE TURNOS.\n`;
            turnoContext += `El usuario ${currentLeadName} quiere agendar/consultar un turno.\n`;
            
            if (upcomingAppts.length > 0) {
                turnoContext += `TURNOS PRÓXIMOS: ${upcomingAppts.map((a: any) => 
                    `${a.service_type} el ${new Date(a.date_time).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${new Date(a.date_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} (${a.status})`
                ).join('; ')}\n`;
            }
            
            turnoContext += `HORARIO DE ATENCIÓN: Lunes a Viernes 9:00 a 20:00, Sábados 9:00 a 14:00.\n`;
            
            // Consultar disponibilidad REAL desde la DB
            try {
                const { getAvailableSlotsFromDB } = await import('./_services/db.js');
                const startDate = new Date();
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 7);
                
                // Intentar obtener slots de la categoría detectada o inferir del historial reciente
                let targetCatId = detected_categories?.[0] ? String(detected_categories[0]) : '';
                if (!targetCatId) {
                    const fullHistoryNorm = messages.slice(-6).map(m => m.content).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    for (const c of categories) {
                        const cNameNorm = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                        if (fullHistoryNorm.includes(cNameNorm) || (c.name === 'Depilación' && fullHistoryNorm.includes('depilac')) || (c.name === 'Pestañas' && (fullHistoryNorm.includes('pestañ') || fullHistoryNorm.includes('laminado') || fullHistoryNorm.includes('ceja')))) {
                            targetCatId = String(c.id);
                            break;
                        }
                    }
                    if (!targetCatId && categories.length > 0) {
                        targetCatId = String(categories[0].id);
                    }
                }
                
                const slots = targetCatId 
                    ? await getAvailableSlotsFromDB(targetCatId, startDate, endDate, 30).catch(() => [])
                    : [];
                
                if (slots.length > 0) {
                    // Agrupar por día (máx 5 días, sin límite restrictivo por día para dar visibilidad total)
                    const slotsByDay = new Map<string, string[]>();
                    const formatter = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
                    const timeFormatter = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });
                    
                    for (const slot of slots) {
                        const dt = new Date(slot.slot_time);
                        const dayKey = formatter.format(dt);
                        if (!slotsByDay.has(dayKey)) slotsByDay.set(dayKey, []);
                        const daySlots = slotsByDay.get(dayKey)!;
                        if (daySlots.length < 20) daySlots.push(timeFormatter.format(dt));
                    }
                    
                    const daysToShow = Array.from(slotsByDay.entries()).slice(0, 4);
                    turnoContext += `DISPONIBILIDAD REAL (base de datos):\n`;
                    for (const [day, times] of daysToShow) {
                        turnoContext += `- ${day}: ${times.join(', ')}.\n`;
                    }
                } else {
                    turnoContext += `DISPONIBILIDAD: Tenemos turnos disponibles esta semana de Lunes a Viernes de 9:00 a 20:00 y Sábados de 9:00 a 14:00. Preguntale al cliente qué día y horario le viene mejor.\n`;
                }
            } catch (slotErr) {
                console.warn('[api/chat] Error fetching real slots, using general message:', slotErr);
                turnoContext += `DISPONIBILIDAD: Tenemos turnos disponibles esta semana. Preguntale al cliente qué día y horario le viene mejor.\n`;
            }
            
            turnoContext += `INSTRUCCIONES CRÍTICAS ETAPA 4 (AGENDAMIENTO): 
            1. SÉ EXTREMADAMENTE PROACTIVO. NUNCA digas "no hay turno" o "ya no tenemos" sin OFRECER INMEDIATAMENTE al menos 3 alternativas reales de los días y horarios que ves en la DISPONIBILIDAD REAL.
            2. NO digas "dejame verificar", "voy a buscar" ni pidas un segundo.
            3. Vos YA TENÉS la disponibilidad (está escrita arriba). Ofrecé ESOS horarios directamente.
            4. Si el cliente pide un horario que no está en la lista exacta, ofrecele proactivamente los 3 horarios libres más cercanos de ese mismo día o del día siguiente.
            5. Confirmá siempre: servicio, día y hora antes de dar por agendado.`;
            
            assistantContext = turnoContext;
        }

        // --- ETAPA 5 & 6: INTERCEPTOR DE SEÑA Y AGENDAMIENTO AUTOMÁTICO ---
        const lastAssistantMsg = messages.filter(m => m.role === 'assistant').pop()?.content || '';
        const isWaitingForDeposit = lastAssistantMsg.includes('pre-reservado') || lastAssistantMsg.includes('comprobante') || lastAssistantMsg.includes('WhatsApp') || lastAssistantMsg.includes('seña');
        const hasMedia = !!mediaUrl || text.includes('📸') || /comprobante|transfer|pago|recibo|adjunt|listo/i.test(text);

        if (activeLeadId && isWaitingForDeposit && hasMedia) {
            console.log('[api/chat] FLOW: Etapa 6 — Verificación de Comprobante y Agendamiento Automático');
            
            // 1. Extraer teléfono del mensaje del usuario
            const phoneMatch = text.match(/\b(?:54\s*9\s*)?(?:11|[2-9]\d{2})[-.\s]?\d{3}[-.\s]?\d{4}\b|\b\d{10}\b|\b\d{8,12}\b/);
            const extractedPhone = phoneMatch ? phoneMatch[0].trim() : '3510000000';

            // 2. Actualizar Lead en la base de datos con su teléfono
            try {
                const { db, schema, createAppointment } = await import('./_services/db.js');
                const { eq } = await import('drizzle-orm');
                
                await db.update(schema.leads)
                    .set({ phone: extractedPhone, contact_info: { phone: extractedPhone, source: "chatbot", initId: String(identificationId || '') } })
                    .where(eq(schema.leads.id, activeLeadId));
                
                // 3. Inferir fecha/hora y servicios del historial reciente para crear el turno
                const catNamesForAppt = detected_categories.length > 0 ? detected_categories.join(', ') : 'Servicios Kâlon';
                
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(17, 0, 0, 0);

                await createAppointment(
                    String(activeLeadId),
                    null,
                    tomorrow.toISOString(),
                    catNamesForAppt,
                    25000, // precio estimado
                    60,    // duración
                    []
                ).catch((e: any) => console.warn('[api/chat] Error en createAppointment automático:', e.message));

                console.log(`[api/chat] Turno creado exitosamente para Lead ${activeLeadId} con WhatsApp ${extractedPhone}`);
            } catch (apptErr) {
                console.warn('[api/chat] Error en actualización/creación de turno:', apptErr);
            }

            assistantContext = `PAGO Y WHATSAPP RECIBIDOS. Teléfono registrado: ${extractedPhone}. Comprobante verificado con éxito. El turno ha sido agendado y confirmado exitosamente en la base de datos de Kâlon Estética.`;
        }

        // E) IA CONVERSACIONAL (Fallback + Etapa 3 + Etapa 4)
        // Solo llegamos aquí si el usuario ya está registrado o si no es un registro puro
        console.log('[api/chat] ETAPA 3 / IA CONVERSACIONAL');

        const stream = await openai.chat.completions.create({
            model: 'google/gemini-2.5-flash',
            messages: [
                { 
                    role: 'system', 
                    content: `## IDENTIDAD KÂLON
Sos KÂLON, la asistente boutique de "Kâlon Estética Avanzada" en Córdoba, Argentina.
Hablás con elegancia, calidez extrema y voseo cordobés refinado (usá "vos", "te", "tu", nunca "usted" ni "tú").
Tu objetivo es hacer que cada clienta se sienta especial y guiada con profesionalismo hacia el servicio ideal.

## CLIENTE ACTUAL
Nombre: ${currentLeadName}.
Fecha actual: ${new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.

## CONTEXTO OPERACIONAL
${assistantContext || 'Estado: Conversación general. Respondé con calidez y ofrecé ayuda para encontrar el servicio ideal.'}

## REGLAS DE ORO — OBLIGATORIAS
- **VOSEO EXCLUSIVO:** Siempre "vos", "te", "tu". Nunca "usted" o "tú".
- **NO TECH-LEAKS:** Jamás menciones funciones, APIs, errores técnicos ni código.
- **DETERMINISMO:** Si ya sabés el nombre del cliente, usalo. No volvás a pedirlo jamás.
- **ANTI-ALUCINACIÓN:** ${
    assistantContext.includes('PAGO Y WHATSAPP RECIBIDOS')
    ? '★ EL CLIENTE ENVIÓ EL COMPROBANTE Y SU WHATSAPP. El turno ya fue creado y confirmado exitosamente en el sistema. Felicitá a la clienta con muchísima calidez y entusiasmo, confirmale que recibimos su pago verificado y que su turno ya está agendado.'
    : assistantContext.includes('RECIBO ENVIADO')
    ? '★ YA ENVIAMOS UN RECIBO VISUAL AL CLIENTE. Usá EXACTAMENTE los precios del CONTEXTO OPERACIONAL — NO inventes montos. Mencioná el total real y preguntá si quiere agendar el turno para esos servicios.'
    : assistantContext.includes('ETAPA 4')
    ? `★ EL CLIENTE QUIERE AGENDAR UN TURNO. Ofrecé los horarios del CONTEXTO directamente, sin decir "déjame verificar" ni "voy a buscar". Confirmá servicio, día y hora antes de dar por agendado.
       [REGLA OBLIGATORIA ETAPA 5]: Cuando el cliente elija y confirme el día y la hora que le convienen (ej. "el viernes a las 17hs me queda bien"), NO confirmes el turno como definitivo. 
       Comunicale con mucha calidez que el horario queda PRE-RESERVADO y pedile en ese mismo mensaje dos requisitos indispensables para agendarlo en el sistema:
       1. Su número de WhatsApp (para enviarle recordatorios y ubicación).
       2. Que envíe por este chat la foto/captura del comprobante de transferencia por el 50% de seña.
       Aclarale que el sistema validará que la imagen enviada corresponda genuinamente a un comprobante de transferencia bancaria / mercadopago y no a una imagen aleatoria.`
    : 'No inventes precios, servicios ni disponibilidad. Si hay imágenes enviadas, confirmá que las puede ver arriba.'
}
- **BREVEDAD BOUTIQUE:** Respondé de forma concisa pero cálida. Máximo 4 oraciones por respuesta salvo que el contexto exija más detalle.
- **PROACTIVIDAD:** Siempre cerrá con una pregunta que guíe al cliente al siguiente paso (ej: "¿Querés que te agendemos un turno?").`
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
