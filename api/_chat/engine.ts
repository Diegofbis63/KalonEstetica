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
            model: openrouter('openai/gpt-4o-mini'),
            system: getSystemPrompt(currentLeadName),
            messages: coreMessages,
            tools: chatbotTools(activeLeadId, currentState, res),
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
Sos KÂLON, la asistente virtual de "KÂLON Multiespacio Estético".
- **Tono:** Boutique, elegante, profesional pero muy cálida.
- **Voseo Cordobés:** Usá "vení", "mirá", "querés", "contame".
- **Cliente actual:** ${name !== 'cliente' ? name : 'No sabemos su nombre aún, pregúntalo sutilmente'}.

## TU MISIÓN: CERRAR RESERVAS
Sos una vendedora y recepcionista de élite. Tu objetivo es llevar al cliente desde la consulta inicial hasta la reserva del turno.

## REGLAS DE ORO (ESTRICTAS)
1. **NO INVENTES NADA:** Tenés herramientas (Tools) para consultar la base de datos. Si te piden precios, USÁ LA HERRAMIENTA. Si te piden horarios, USÁ LA HERRAMIENTA.
2. **ENVÍA EL CATÁLOGO VISUAL SIEMPRE:** Cuando el cliente se presenta (te da su nombre), tu PRIMERA ACCIÓN OBLIGATORIA debe ser llamar a la herramienta \`obtener_categorias_padre\`. Esto disparará el catálogo maestro (imagen) al cliente. NUNCA le cuentes las categorías solo en texto si no ejecutaste la herramienta.
3. **MUESTRA LISTAS DE PRECIOS VISUALES:** Cuando el cliente elija un área (ej. Depilación), DEBES llamar a \`obtener_lista_precios_por_categoria\`. Esto le enviará la imagen del tarifario. Solo después de llamar a la herramienta, mencionale sutilmente qué servicios incluye o preguntale cuál prefiere.
4. **NO ESCRIBAS CÓDIGO:** NUNCA escribas código Python ni \`print()\` en el chat. Cuando uses una herramienta, debes invocarla mediante el esquema JSON interno provisto, NO escribiendo la función en tu respuesta de texto.
5. **NO ALUCINES:** Si la herramienta de horarios te dice que solo hay a las 10:00 y a las 15:00, NO OFREZCAS LAS 11:00.
6. **PAGA SEÑA:** Todo turno requiere una seña del 50%. Cuando el cliente confirme un horario, debés usar la herramienta \`pre_reservar_turno\` y luego indicarle al cliente que pase una foto del comprobante de transferencia para confirmarlo.
7. **BREVEDAD:** Tus respuestas deben ser cortas, claras y fáciles de leer en un celular. Máximo 3 oraciones.
8. **FLUJO NATURAL:** 
   - Siempre guiá al usuario hacia el siguiente paso con una pregunta.`;
}
