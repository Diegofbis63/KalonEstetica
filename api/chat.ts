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
        const { messages = [], leadId, identificationId, message } = req.body as { 
            messages: Array<{ role: string; content: string }>;
            leadId?: string | number;
            identificationId?: string;
            message?: string;
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
        const catList = categories.map(c => `${c.id}: ${c.name}`).join(', ');

        const classificationPrompt = `Analiza el mensaje del usuario para KÂLON Estética.
        Categorías disponibles: [${catList}]
        Estado actual del Lead: ${activeLeadId ? 'Identificado' : 'No Identificado'}
        
        Responde ÚNICAMENTE un objeto JSON con:
        {
          "intent": "SALUDO" | "REGISTRO" | "CONSULTA_SERVICIO" | "TURNO" | "OTRO",
          "detected_categories": [ids_de_categorias_detectadas],
          "detected_name": "nombre si es registro",
          "is_negation": true/false
        }
        
        Mensaje: "${text}"`;

        const classificationResponse = await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash-001',
            messages: [{ role: 'system', content: classificationPrompt }],
            response_format: { type: 'json_object' }
        }).catch(() => null);

        const classification = JSON.parse(classificationResponse?.choices[0]?.message?.content || '{}');
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
            
            const matchedServices = allServices.filter((s: any) => {
                // Matching PRECISO — buscamos en TODAS las categorías, el filtro de nombre ya es estricto
                const serviceTitle = (s.title || '').replace(/^\d+[\s.]*/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                
                // Fase 1: ¿El usuario escribió exactamente el nombre del servicio? (ej: "laminado de cejas")
                if (userTextNorm.includes(serviceTitle)) return true;
                
                // Fase 2: ¿El servicio es una palabra simple que el usuario mencionó? (ej: servicio="Axilas", user="axilas y laminado")
                // Solo aplica para servicios de 1-2 palabras significativas (evita combos falsos)
                const significantWords = serviceTitle.split(/[\s+/()]+/).filter((w: string) => w.length > 3);
                if (significantWords.length <= 2) {
                    return significantWords.every((w: string) => userTextNorm.includes(w));
                }
                
                return false;
            });

            // Deduplicar SOLO dentro de la misma categoría
            // "Cejas" (Depilación) y "Laminado de cejas" (Pestañas) son servicios DIFERENTES
            const deduped = matchedServices.filter((s: any, _i: number, arr: any[]) => {
                const sTitle = (s.title || '').replace(/^\d+[\s.]*/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                return !arr.some((other: any) => {
                    if (other.id === s.id) return false;
                    if (String(other.category_id) !== String(s.category_id)) return false; // ← Solo dedup en misma categoría
                    const otherTitle = (other.title || '').replace(/^\d+[\s.]*/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    return otherTitle !== sTitle && otherTitle.includes(sTitle);
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
        // BLINDAJE: Si no hay lead y el texto parece un nombre, registrar SIN depender del clasificador
        const looksLikeName = !activeLeadId && 
            text.split(/\s+/).length >= 2 && 
            text.length > 3 && text.length < 60 &&
            !/\d/.test(text) && 
            !/^(hola|buen|quiero|necesito|me |tengo|cuanto|cual|que |como|donde|cuando|hay |si |no |tene|tiene|puede|puedo|quisiera|queria|podria|agenda|reserv|turno|cita|horario|disponib|cancel|modific|cambi|para |ya |estoy|dale|ok|listo|perfect|gracia|chau|bye|adios)/i.test(text) &&
            !/turno|cita|agendar|reservar|horario|disponib|cancelar|fecha|hora /i.test(text) &&
            detected_categories.length === 0;
        
        const nameForRegistration = detected_name || (looksLikeName ? text : null);
        
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
        const currentLeadName = leadByInitId?.first_name || detected_name || 'cliente';

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
            turnoContext += `INSTRUCCIONES: Preguntale al usuario qué servicio quiere, para qué día y horario. Ofrecé opciones concretas. Si ya mencionó servicios antes en la conversación, usá esos. Confirmá los datos antes de agendar.`;
            
            assistantContext = turnoContext;
        }

        // E) IA CONVERSACIONAL (Fallback + Etapa 3 + Etapa 4)
        // Solo llegamos aquí si el usuario ya está registrado o si no es un registro puro
        console.log('[api/chat] ETAPA 3 / IA CONVERSACIONAL');

        const stream = await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash-001',
            messages: [
                { 
                    role: 'system', 
                    content: `Eres la asistente experta de Kâlon Estética. 
                    Tu nombre es Asistente Kâlon.
                    Usuario actual: ${currentLeadName}.
                    ${assistantContext ? `CONTEXTO ACTUAL: ${assistantContext}` : 'Estado: Consulta general.'}
                    
                    REGLAS:
                    ${assistantContext.includes('RECIBO ENVIADO') ? `
                    ★ YA GENERAMOS Y ENVIAMOS UN RECIBO/PRESUPUESTO VISUAL AL CLIENTE.
                    ★ En tu respuesta, mencioná los servicios y el TOTAL REAL que aparece arriba en el CONTEXTO ACTUAL.
                    ★ NO inventes precios. Usá EXACTAMENTE los montos del contexto.
                    ★ Preguntá directamente si quiere agendar un turno para esos servicios.
                    ★ Sé breve, cálida y profesional. Usá el nombre ${currentLeadName}.
                    ` : assistantContext.includes('ETAPA 4') ? `
                    ★ EL CLIENTE QUIERE AGENDAR O CONSULTAR UN TURNO.
                    ★ Preguntale qué servicio necesita (si no lo mencionó antes), para qué día y en qué horario.
                    ★ Ofrecé opciones concretas basándote en el horario de atención del contexto.
                    ★ Si el cliente ya mencionó servicios anteriormente, referite a esos.
                    ★ Confirmá siempre: servicio, día y hora antes de dar por agendado.
                    ★ Sé cálida, proactiva y eficiente. Usá el nombre ${currentLeadName}.
                    ★ NO inventes turnos confirmados. Solo proponé opciones.
                    ` : `
                    1. Si ya enviamos precios como imágenes, confirmá que los puede ver arriba.
                    2. No inventes precios ni servicios.
                    3. Sé breve, cálida y profesional. Usá el nombre ${currentLeadName}.
                    4. Ofrecé agendar un turno si corresponde.
                    `}` 
                },
                ...messages.map((m) => ({ role: m.role as any, content: m.content }))
            ],
            stream: true,
        });

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
