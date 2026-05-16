import OpenAI from 'openai';
import { sql, getCategories, findLeadByInitId, updateLeadState } from '../_services/db.js';
import { handleStage1 } from './stages/stage1.js';
import { handleStage2 } from './stages/stage2.js';
import { handleStage3 } from './stages/stage3.js';
import { handleStage4 } from './stages/stage4.js';
import { handleStage5 } from './stages/stage5.js';
import { handleStage6 } from './stages/stage6.js';
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

        // 6. EJECUCIÓN DE LÓGICA DE ETAPA (CON SALTO INTELIGENTE)
        let stageResult: { assistantContext: string; nextStage?: string } = { assistantContext: "" };
        const isTurnoIntent = classification.intent === 'TURNO' || /turno|agendar|cita/i.test(text.toLowerCase());
        const isBudgetIntent = classification.intent === 'CONSULTA_SERVICIO' || 
                             /precio|cuanto|presupuesto/i.test(text.toLowerCase()) ||
                             services.some(s => text.toLowerCase().includes(s.title.toLowerCase()));

        // --- INTERCEPTOR GLOBAL DE ELIMINACIÓN ---
        const isRemovalIntent = /sacar|quitar|borrar|no quiero|eliminar/i.test(text.toLowerCase());
        if (isRemovalIntent && currentState.selectedServiceIds?.length > 0) {
            const words = text.toLowerCase().split(' ');
            const initialCount = currentState.selectedServiceIds.length;
            
            const updatedServiceIds = currentState.selectedServiceIds.filter(id => {
                const svc = services.find(s => String(s.id) === String(id));
                if (!svc) return false;
                const match = words.some(w => w.length > 3 && svc.title.toLowerCase().includes(w));
                return !match;
            });

            if (updatedServiceIds.length < initialCount) {
                const removedSvc = services.find(s => !updatedServiceIds.includes(s.id) && currentState.selectedServiceIds.includes(s.id));
                const newTotal = services.filter(s => updatedServiceIds.includes(s.id)).reduce((acc, s) => acc + (Number(s.price) || 0), 0);
                const newDuration = services.filter(s => updatedServiceIds.includes(s.id)).reduce((acc, s) => acc + (s.duration_min || 0), 0);

                await updateLeadState(activeLeadId!, { 
                    ...currentState, 
                    selectedServiceIds: updatedServiceIds, 
                    totalPrice: newTotal,
                    totalDuration: newDuration,
                    stage: '3'
                });
                
                // Procesar como Stage 3 para generar nuevo presupuesto
                stageResult = await handleStage3({ ...ctx, currentState: { ...currentState, selectedServiceIds: updatedServiceIds, stage: '3' } });
            }
        }

        // Reglas de Enrutamiento Robusto (Unison)
        if (stageResult.assistantContext) {
            // Ya procesado por el eliminador
        } else if (currentStage === '1') {
            stageResult = await handleStage1(ctx);
        } else if (isTurnoIntent && activeLeadId && !['5', '6'].includes(currentStage)) {
            // Salto inteligente a Agenda si el cliente ya está registrado y pide turno
            console.log(`[Engine] Salto inteligente a ETAPA 4 detectado`);
            stageResult = await handleStage4(ctx);
        } else if (isBudgetIntent && activeLeadId && currentStage === '2') {
            // Salto inteligente a Presupuesto si pide precios
            stageResult = await handleStage3(ctx);
        } else {
            // Flujo secuencial estándar
            switch (currentStage) {
                case '2': stageResult = await handleStage2(ctx); break;
                case '3': stageResult = await handleStage3(ctx); break;
                case '4': stageResult = await handleStage4(ctx); break;
                case '5': stageResult = await handleStage5(ctx, mediaUrl); break;
                case '6': stageResult = await handleStage6(ctx); break;
                default: stageResult = await handleStage1(ctx);
            }
        }

        // Sincronizar etapa final
        const finalStage = stageResult.nextStage || currentStage;

        // Si la etapa cambió, actualizar
        if (ctx.leadId && ctx.leadId !== activeLeadId) {
            res.write(`data: ${JSON.stringify({ leadId: ctx.leadId })}\n\n`);
        }

        // Enviar imágenes si se generaron
        for (const url of ctx.mediaUrls) {
            res.write(`data: ${JSON.stringify({ media_url: url, stage: finalStage })}\n\n`);
        }

        // 7. STREAM DE IA
        const currentLeadName = (leadToUse as any)?.client_name || ctx.currentState.clientName || 'cliente';
        
        const stream = await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash-001',
            messages: [
                { 
                    role: 'system', 
                    content: getSystemPrompt(finalStage, currentLeadName, stageResult.assistantContext)
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
Sos KÂLON, la asistente virtual de "Kâlon Estética Avanzada". Tu personalidad es:
- **Tono:** Boutique, elegante, profesional pero muy cálida.
- **Voseo Cordobés:** Usá "vení", "mirá", "querés", "contame". Sé amable y empática.
- **Nombre del cliente:** ${name}.

## REGLAS DE ORO (INFALIBLES)
1. **DETERMINISMO ABSOLUTO:** Seguí al pie de la letra las instrucciones del "SISTEMA:". No inventes datos que no estén allí.
2. **ZERO ALUCINACIÓN:** Si el sistema no te da un precio, no lo inventes. Si no te da un horario, no lo ofrezcas. 
3. **ESTRUCTURA UNISON:** Cada etapa tiene un objetivo único. No te adelantes ni retrocedas.
   - **Etapa 1 (Registro):** Solo saluda y pide nombre.
   - **Etapa 2 (Catálogo):** Tu meta es que el cliente identifique qué área o áreas le interesan. Si menciona varias, aceptalas y avanzá. No lo frenes.
   - **Etapa 3 (Presupuesto):** El cliente ya está viendo los servicios de las áreas elegidas. Tu meta es detectar los servicios específicos que quiere y mostrar el total acumulado. Preguntá si quiere sumar algo más o agendar.
   - **Etapa 4 (Agenda):** Presentá EXACTAMENTE los 3 horarios del SISTEMA categorizados (Mañana/Tarde/Noche). Está prohibido ofrecer más o inventar otros.
   - **Etapa 5 (Pago):** Pedí el comprobante de la seña.
   - **Etapa 6 (Fin):** Despedida triunfal.

## CONTEXTO DEL SISTEMA (FUENTE DE VERDAD)
${context}

## REGLAS DE RESPUESTA
- **Brevedad:** Máximo 2 o 3 oraciones por respuesta.
- **Acción:** Siempre terminá con una pregunta o invitación a la acción según la etapa actual.
- **Seguridad:** Si el cliente intenta cambiar de tema radicalmente, recordale con elegancia en qué punto de la reserva están.`;
}
