import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { sql, findLeadByInitId, updateLeadState, getActiveServices, getCategories } from '../_services/db.js';
import { matchServicesGreedily } from './utils.js';
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

        // Fecha actual en zona horaria Argentina para pasarla al system prompt
        const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Cordoba' });
        // Resultado: "2026-05-21" (en-CA usa YYYY-MM-DD nativo y confiable en Node.js)

        const result = streamText({
            model: openrouter('google/gemini-2.0-flash-001'),
            system: getSystemPrompt(currentLeadName, todayISO),
            messages: coreMessages,
            tools: chatbotTools(activeLeadId, currentState, res),
            maxSteps: 8, // Aumentado: permite múltiples tool calls (una por cada categoría mencionada + procesamiento)
            onStepFinish: async (step) => {
                // Si la herramienta pre_reservar_turno fue llamada, enviamos actualización de etapa
                if (step.toolCalls.some(tc => tc.toolName === 'pre_reservar_turno')) {
                    res.write(`data: ${JSON.stringify({ stage: '5' })}\n\n`);
                }
            }
        });

        // 6. Consumir el TextStream con detección de código Python como fallback
        let accumulatedText = '';
        let pythonFallback = false;

        for await (const chunk of result.textStream) {
            if (!chunk) continue;
            accumulatedText += chunk;

            // Detectar si Gemini escribió Python en vez de llamar la herramienta
            if (!pythonFallback && accumulatedText.includes('print(') && accumulatedText.includes('generar_presupuesto')) {
                pythonFallback = true;
                console.warn('[Engine] Python fallback detected - computing budget server-side');
                continue; // No enviar el código Python al frontend
            }

            if (!pythonFallback) {
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
            }
        }

        // Si Gemini escribió Python, calcular el presupuesto directamente en el servidor
        if (pythonFallback) {
            try {
                // Extraer servicios del código Python con regex
                const listMatch = accumulatedText.match(/servicios(?:_solicitados)?=\[([^\]]+)\]/);
                const strMatch  = accumulatedText.match(/servicios=["']([^"']+)["']/);
                let serviceText = '';
                if (listMatch) {
                    serviceText = listMatch[1].replace(/["']/g, '').split(',').map((s: string) => s.trim()).join(' ');
                } else if (strMatch) {
                    serviceText = strMatch[1];
                }

                if (serviceText) {
                    const [allSvcs, allCats] = await Promise.all([getActiveServices(), getCategories()]);
                    const matched = matchServicesGreedily(serviceText, allSvcs, allCats);

                    if (matched && matched.length > 0) {
                        const total = matched.reduce((acc: number, s: any) => acc + (Number(s.price) || 0), 0);
                        const sena = Math.round(total / 2);
                        const lines = matched.map((s: any) => `✨ ${s.title}: $${Number(s.price).toLocaleString('es-AR')}`).join('\n');
                        const budgetText = `📋 Tu presupuesto KÂLON:\n${lines}\n\n💰 Total: $${total.toLocaleString('es-AR')}\n💳 Seña requerida (50%): $${sena.toLocaleString('es-AR')}\n\n¿Sumamos algo más o pasamos a elegir el turno? 📅`;
                        if (activeLeadId) {
                            await updateLeadState(activeLeadId, { ...currentState, selectedServiceIds: matched.map((s: any) => String(s.id)), totalPrice: total, stage: '4' });
                        }
                        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: budgetText } }] })}\n\n`);
                    } else {
                        const txt = 'No encontré esos servicios exactos. ¿Podés decirme cuál elegiste de las imágenes que te mandé?';
                        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: txt } }] })}\n\n`);
                    }
                }
            } catch (err: any) {
                console.error('[Engine] Budget fallback error:', err?.message);
                const txt = 'Hubo un error calculando el presupuesto. ¿Podés decirme de nuevo qué servicios querés?';
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: txt } }] })}\n\n`);
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

function getSystemPrompt(name: string, todayISO: string = new Date().toISOString().split('T')[0]) {
    return `## IDENTIDAD KÂLON
Sos KÂLON, la asistente virtual de "KÂLON Multiespacio Estético".
- **Tono:** Boutique, elegante, profesional pero muy cálida.
- **Voseo Cordobés:** Usá "vení", "mirá", "querés", "contame".
- **Cliente actual:** ${name !== 'cliente' ? name : 'No sabemos su nombre aún, pregúntalo sutilmente'}.
- **Fecha actual (IMPORTANTE):** Hoy es ${todayISO} (formato YYYY-MM-DD). Cuando el cliente diga "hoy" usá exactamente esta fecha. Cuando diga "mañana" sumá 1 día a esta fecha.

## TU MISIÓN: CERRAR RESERVAS
Sos una vendedora y recepcionista de élite. Tu objetivo es llevar al cliente desde la consulta inicial hasta la reserva del turno.

## REGLAS DE ORO (ESTRICTAS)
1. **NO INVENTES NADA:** Tenés herramientas (Tools) para consultar la base de datos. Si te piden precios, USÁ LA HERRAMIENTA. Si te piden horarios, USÁ LA HERRAMIENTA.
2. **ENVÍA EL CATÁLOGO VISUAL SIEMPRE (PROHIBIDO CATÁLOGO EN TEXTO):** Cuando el cliente se presenta (te da su nombre), tu PRIMERA ACCIÓN OBLIGATORIA debe ser llamar a la herramienta \`obtener_categorias_padre\`. Esto disparará automáticamente el catálogo maestro visual (imagen) al cliente. **ESTÁ TERMINANTEMENTE PROHIBIDO que enlistes, repitas o menciones las categorías en forma de lista o viñetas en tu respuesta de texto** (no escribas 'Depilación', 'Reiki', 'Facial', etc., en el texto). La imagen ya lo muestra todo de forma muy estética. Solo dale una bienvenida cálida, indícale amigablemente que arriba puede ver el catálogo en la imagen, y pregúntale muy brevemente qué área le gustaría explorar hoy.
3. **MUESTRA LISTAS DE PRECIOS VISUALES (PROHIBIDO PRECIOS O SUB-SERVICIOS EN TEXTO):** Cuando el cliente elija una o más áreas (ej. "Depilación y Pestañas"), DEBES llamar a \`obtener_lista_precios_por_categoria\` UNA VEZ POR CADA CATEGORÍA MENCIONADA (dos llamadas si menciona dos, tres si menciona tres, etc). NUNCA respondas diciendo que ya enviaste las imágenes sin haber ejecutado la herramienta primero. **ESTÁ TERMINANTEMENTE PROHIBIDO volver a enlistar, nombrar o detallar los sub-servicios, precios o duraciones en tu respuesta de texto**, ya que satura la pantalla y la imagen ya los contiene. Solo hazle una pregunta súper breve y amigable sobre cuál de los servicios de las imágenes le gustaría realizarse.
4. **GENERA PRESUPUESTO VISUAL OBLIGATORIO:** Cuando el cliente especifique los servicios que desea (ej. "tiro y lifting de pestañas", "depilación de piernas y cejas"), tu PRIMERA ACCIÓN OBLIGATORIA es llamar a la herramienta \`generar_presupuesto\` con los nombres de los servicios en el campo \`servicios\` (separados por coma). Esta herramienta buscará los servicios en la base de datos y calculará el total real y la seña del 50%. NUNCA calcules precios de memoria ni inventes montos. Después confirmá los servicios con calidez, mencioná el total y la seña, y preguntá: "¿Sumamos algo más o pasamos a elegir el turno?"
5. **NO ESCRIBAS CÓDIGO:** NUNCA escribas código Python ni \`print()\` en el chat. Cuando uses una herramienta, debes invocarla mediante el esquema JSON interno provisto, NO escribiendo la función en tu respuesta de texto.
6. **NO ALUCINES:** Si la herramienta de horarios te dice que solo hay a las 10:00 y a las 15:00, NO OFREZCAS LAS 11:00.
7. **PAGA SEÑA:** Todo turno requiere una seña del 50%. Cuando el cliente confirme un horario, debés usar la herramienta \`pre_reservar_turno\` y luego indicarle al cliente que pase una foto del comprobante de transferencia para confirmarlo.
8. **BREVEDAD:** Tus respuestas deben ser cortas, claras y fáciles de leer en un celular. Máximo 3 oraciones. Está prohibido duplicar información que ya aparece en las imágenes enviadas.
9. **FLUJO NATURAL:** 
   - Siempre guiá al usuario hacia el siguiente paso con una pregunta.`;
}
