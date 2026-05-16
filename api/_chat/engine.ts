import OpenAI from 'openai';
import { sql, getCategories, findLeadByInitId } from '../_services/db.js';
import { handleStage1 } from './stages/stage1.js';
import { handleStage2And3 } from './stages/stage2_3.js';
import { handleStage4 } from './stages/stage4.js';
import { handleStage5And6 } from './stages/stage5_6.js';
import type { ClassificationResult, StageContext, ChatState } from './types.js';
import type { VercelResponse } from '@vercel/node';

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || 'sk-or-dummy',
});

export async function processChat(reqBody: any, res: VercelResponse) {
    const { messages = [], leadId, identificationId, message, mediaUrl } = reqBody;
    const lastMessage = messages[messages.length - 1];
    const text = (message || lastMessage?.content || '').trim();
    
    // 1. Iniciar Stream de inmediato
    if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Connection', 'keep-alive');
    }

    try {
        // 2. Identificación robusta del Lead
        let leadToUse = null;
        if (leadId) {
            const rows = await sql`SELECT * FROM leads WHERE id = ${leadId} LIMIT 1`.catch(() => []);
            leadToUse = rows[0] || null;
        } else if (identificationId) {
            // Buscar por identificación_id (UUID) o por initId
            const rows = await sql`SELECT * FROM leads WHERE id::text = ${identificationId} OR identification_id = ${identificationId} LIMIT 1`.catch(() => []);
            leadToUse = rows[0] || null;
            if (!leadToUse && String(identificationId).length > 10) {
                leadToUse = await findLeadByInitId(String(identificationId)).catch(() => null);
            }
        }
        
        let activeLeadId = leadToUse?.id || leadId || null;
        let currentState: ChatState = leadToUse?.current_state || { stage: '1' };
        let currentStage = String(currentState.stage || '1');

        // Bloqueo de seguridad: Si ya tiene nombre, no puede estar en Etapa 1
        if (currentStage === '1' && (leadToUse?.client_name || currentState.clientName)) {
            currentStage = '2';
        }

        // 3. ENVIAR ID DE LEAD INMEDIATAMENTE SI EXISTE
        if (activeLeadId) {
            res.write(`data: ${JSON.stringify({ leadId: activeLeadId })}\n\n`);
        }

        // 4. Consultas de soporte en paralelo
        const categoriesPromise = getCategories().catch(() => []);
        const servicesPromise = sql`SELECT s.id, s.title, s.category_id FROM services s WHERE s.active = true`.catch(() => []);
        
        // 5. CLASIFICACIÓN (En paralelo con las consultas de soporte)
        const classificationPromise = classifyIntent(text, !!activeLeadId, currentStage, messages, await categoriesPromise);
        
        const [categories, services, classification] = await Promise.all([
            categoriesPromise, 
            servicesPromise, 
            classificationPromise
        ]);

        const ctx: StageContext = {
            text,
            leadId: activeLeadId,
            identificationId,
            currentState,
            classification,
            categories,
            services,
            mediaUrls: [],
            stage: currentStage
        };

        // 6. EJECUCIÓN DE LÓGICA DE ETAPA
        let stageResult = { assistantContext: "" };
        
        if (currentStage === '1') {
            stageResult = await handleStage1(ctx);
        } else if (currentStage === '2' || currentStage === '3') {
            stageResult = await handleStage2And3(ctx);
        } else if (currentStage === '4') {
            stageResult = await handleStage4(ctx);
        } else if (currentStage === '5' || currentStage === '6') {
            stageResult = await handleStage5And6(ctx, mediaUrl);
        }

        // Si la etapa cambió, actualizar
        if (ctx.leadId && ctx.leadId !== activeLeadId) {
            res.write(`data: ${JSON.stringify({ leadId: ctx.leadId })}\n\n`);
        }

        // Enviar imágenes si se generaron
        for (const url of ctx.mediaUrls) {
            res.write(`data: ${JSON.stringify({ media_url: url, stage: ctx.stage })}\n\n`);
        }

        // 7. STREAM DE IA
        const currentLeadName = (leadToUse as any)?.client_name || ctx.currentState.clientName || 'cliente';
        
        const stream = await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash-001',
            messages: [
                { 
                    role: 'system', 
                    content: getSystemPrompt(currentStage, currentLeadName, stageResult.assistantContext)
                },
                ...messages.map((m: any) => ({ role: m.role as any, content: m.content }))
            ],
            stream: true,
        }, { timeout: 15000 });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error: any) {
        console.error('[Engine] Error:', error);
        res.write(`data: ${JSON.stringify({ error: "Ocurrió un error en la conexión. Por favor, intenta de nuevo." })}\n\n`);
        res.end();
    }
}

async function classifyIntent(text: string, hasLead: boolean, stage: string, history: any[], categories: any[]): Promise<ClassificationResult> {
    // Clasificación rápida por keywords
    const low = text.toLowerCase();
    if (!hasLead && /hola|buen/i.test(low)) return { intent: 'SALUDO', detected_categories: [], is_negation: false };
    
    // Si no es obvio, usamos IA
    try {
        const categoryNames = categories.map((c: any) => c.name).join(', ');
        const response = await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash-001',
            messages: [{ 
                role: 'system', 
                content: `Clasifica la intención del usuario para KÂLON Estética. 
                Categorías disponibles: [${categoryNames}]
                Referencia Temporal (Hoy): ${new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} a las ${new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}.
                Responde ÚNICAMENTE JSON: { 
                  "intent": "SALUDO"|"REGISTRO"|"CONSULTA_SERVICIO"|"TURNO"|"OTRO", 
                  "detected_categories": ["Nombre Exacto"], 
                  "detected_name": "...", 
                  "is_negation": false,
                  "detected_date": "YYYY-MM-DD",
                  "detected_time": "HH:mm"
                }
                Etapa actual: ${stage}` 
            }, { role: 'user', content: text }],
            response_format: { type: 'json_object' }
        }, { timeout: 4000 });

        return JSON.parse(response.choices[0].message.content || '{}');
    } catch {
        return { intent: 'OTRO', detected_categories: [], is_negation: false };
    }
}

function getSystemPrompt(stage: string, name: string, context: string) {
    return `## IDENTIDAD KÂLON
Sos KÂLON, la asistente boutique de "Kâlon Estética Avanzada". Hablás con elegancia, calidez y voseo cordobés.
Nombre del cliente: ${name}. 

## REGLAS DE FLUJO (ESTRICTO)
Tu etapa actual es: ${stage}. NO puedes saltar de etapa ni pedir información de etapas futuras.

- ETAPA 1 (Registro): Solo saluda y pide nombre/apellido.
- ETAPA 2 (Información): El cliente ya recibió la imagen del catálogo de su área de interés. Comenta sobre los servicios que ve en la imagen y pregunta qué le gustaría probar. No hables de precios totales todavía.
- ETAPA 3 (Presupuesto): El cliente ya recibió la imagen de su presupuesto con el total. Pregunta si desea agendar un turno para esos servicios.
- ETAPA 4 (Agenda): Ayuda a elegir un horario disponible. 
- ETAPA 5/6 (Pago/Confirmación): Guía el envío del comprobante y finaliza con elegancia.

## CONTEXTO ADICIONAL
${context}

## REGLAS DE RESPUESTA
- Sé concisa (2-3 oraciones). 
- **CRÍTICO:** El sistema acaba de enviar las imágenes del catálogo solicitado. Tú NO envías las imágenes, el sistema lo hace. Tu trabajo es confirmar que las estás viendo con el cliente (ej: "Ahí te pasé el catálogo de depilación, ¿viste qué buenas opciones?") y guiar la conversación.
- Nunca inventes precios ni horarios que no estén en el contexto.`;
}
