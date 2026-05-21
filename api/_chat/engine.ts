import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { sql, findLeadByInitId, updateLeadState } from '../_services/db.js';
import type { ChatState } from './types.js';
import type { VercelResponse } from '@vercel/node';
import { chatbotTools } from './tools.js';

// Configuración de OpenRouter para usar Gemini 2.0 Flash a través del SDK de Vercel AI
const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || 'sk-or-dummy',
});

export async function processChat(reqBody: any, res: VercelResponse) {
    const { messages = [], leadId, identificationId, message, mediaUrl } = reqBody;
    
    // 1. Iniciar Stream SSE de inmediato
    if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Connection', 'keep-alive');
    }

    try {
        // 2. Identificación robusta del Lead (Mantenido por retrocompatibilidad y seguridad)
        let leadToUse = null;
        if (leadId) {
            const rows = await sql`SELECT * FROM leads WHERE id = ${leadId} LIMIT 1`.catch(() => []);
            leadToUse = rows[0] || null;
        } else if (identificationId) {
            const rows = await sql`SELECT * FROM leads WHERE id::text = ${identificationId} OR identification_id = ${identificationId} LIMIT 1`.catch(() => []);
            leadToUse = rows[0] || null;
            if (!leadToUse && String(identificationId).length > 10) {
                leadToUse = await findLeadByInitId(String(identificationId)).catch(() => null);
            }
        }
        
        const activeLeadId = leadToUse?.id || leadId || null;
        const currentState: ChatState = leadToUse?.current_state || { stage: '1' };

        // 3. ENVIAR ID DE LEAD INMEDIATAMENTE SI EXISTE
        if (activeLeadId) {
            res.write(`data: ${JSON.stringify({ leadId: activeLeadId })}\n\n`);
        }

        // 4. Lógica de Pago por Comprobante (Etapa 5)
        // Mantenemos este pequeño interceptor porque manejar archivos adjuntos en el LLM es más complejo.
        if (mediaUrl) {
            if (activeLeadId) {
                await updateLeadState(activeLeadId, { ...currentState, stage: '6' });
            }
            res.write(`data: ${JSON.stringify({ stage: '6' })}\n\n`);
            const finalMsg = "¡Recibí tu comprobante perfectamente! 🎉 Ya he confirmado tu turno de manera oficial. Te esperamos en Kâlon Estética. Si tenés alguna duda antes de venir, escribime. ¡Que tengas un hermoso día!";
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: finalMsg } }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
        }

        // 5. ORQUESTACIÓN AGENTICA (Vercel AI SDK + Tools)
        const currentLeadName = (leadToUse as any)?.client_name || currentState.clientName || 'cliente';
        
        // Formatear mensajes para el AI SDK (asegurar que solo tengan role y content válidos)
        const coreMessages = messages.map((m: any) => ({
            role: m.role,
            content: m.content
        }));

        const result = streamText({
            model: openrouter('google/gemini-2.0-flash-001'),
            system: getSystemPrompt(currentLeadName),
            messages: coreMessages,
            tools: chatbotTools(activeLeadId, currentState),
            maxSteps: 3, // Permite que el LLM llame a múltiples herramientas en un solo turno si es necesario
            onStepFinish: async (step) => {
                // Si la herramienta pre_reservar_turno fue llamada, enviamos actualización de etapa
                if (step.toolCalls.some(tc => tc.toolName === 'pre_reservar_turno')) {
                    res.write(`data: ${JSON.stringify({ stage: '5' })}\n\n`);
                }
            }
        });

        // 6. Consumir el TextStream y formatearlo para el frontend (Retrocompatibilidad SSE)
        for await (const chunk of result.textStream) {
            if (chunk) {
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
            }
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error: any) {
        console.error('[Engine] Agentic Flow Error:', error);
        res.write(`data: ${JSON.stringify({ error: "Ocurrió un error en la conexión. Por favor, intenta de nuevo." })}\n\n`);
        res.end();
    }
}

function getSystemPrompt(name: string) {
    return `## IDENTIDAD KÂLON
Sos KÂLON, la asistente virtual de "Kâlon Estética Avanzada".
- **Tono:** Boutique, elegante, profesional pero muy cálida.
- **Voseo Cordobés:** Usá "vení", "mirá", "querés", "contame".
- **Cliente actual:** ${name !== 'cliente' ? name : 'No sabemos su nombre aún, pregúntalo sutilmente'}.

## TU MISIÓN: CERRAR RESERVAS
Sos una vendedora y recepcionista de élite. Tu objetivo es llevar al cliente desde la consulta inicial hasta la reserva del turno.

## REGLAS DE ORO (ESTRICTAS)
1. **NO INVENTES NADA:** Tenés herramientas (Tools) para consultar la base de datos. Si te piden precios, USÁ LA HERRAMIENTA. Si te piden horarios, USÁ LA HERRAMIENTA.
2. **NO ALUCINES:** Si la herramienta de horarios te dice que solo hay a las 10:00 y a las 15:00, NO OFREZCAS LAS 11:00.
3. **PAGA SEÑA:** Todo turno requiere una seña del 50%. Cuando el cliente confirme un horario, debés usar la herramienta \`pre_reservar_turno\` y luego indicarle al cliente que pase una foto del comprobante de transferencia para confirmarlo.
4. **BREVEDAD:** Tus respuestas deben ser cortas, claras y fáciles de leer en un celular. Máximo 3 oraciones.
5. **FLUJO NATURAL:** 
   - Si no sabés qué busca, ofreceles las categorías principales.
   - Si saben el área (ej. Depilación), mostrales los sub-servicios de esa área y preguntá cuál quieren.
   - Si quieren agendar, preguntales qué día prefieren o en qué momento (mañana/tarde).
   - Siempre guiá al usuario hacia el siguiente paso con una pregunta.`;
}
