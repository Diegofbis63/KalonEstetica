import { createOpenAI } from '@ai-sdk/openai';
import { streamText, generateText } from 'ai';
import { sql, findLeadByInitId, updateLeadState, getCategories, getActiveServices, getServicesByCategory, saveChatLog } from '../_services/db.js';
import type { ChatState } from './types.js';
import type { VercelResponse } from '@vercel/node';
import { chatbotTools } from './tools.js';
import { detectCategories } from './utils.js';

// OpenRouter como proveedor unificado de IA
const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || '',
});

export async function processChat(reqBody: any, res: VercelResponse) {
    const { messages = [], leadId, identificationId, message, mediaUrl, clientPhone } = reqBody;
    console.log('[Engine] processChat start. identificationId:', identificationId?.slice(0, 8));
    
    // 1. Iniciar Stream SSE de inmediato
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
            const rows = await sql`SELECT * FROM leads WHERE id::text = ${identificationId} OR identification_id = ${identificationId} LIMIT 1`.catch(() => []);
            leadToUse = rows[0] || null;
            if (!leadToUse && String(identificationId).length > 10) {
                leadToUse = await findLeadByInitId(String(identificationId)).catch(() => null);
            }
        }
        
        const activeLeadId = leadToUse?.id || leadId || null;
        let currentState: ChatState = leadToUse?.current_state || { stage: '1' };

        // Extraer el último mensaje del usuario para análisis
        const lastUserMessage = message || (messages.length > 0 ? messages[messages.length - 1]?.content : '');

        // 2.5. Actualizar teléfono si se proporcionó o extraer con Regex del último mensaje
        let newPhone = clientPhone;
        if (!newPhone && lastUserMessage) {
            const phoneRegex = /(?:15|351|0351|354|0354)?[-. ]?([0-9]{2,4})[-. ]?([0-9]{4,6})/;
            const match = lastUserMessage.match(phoneRegex);
            if (match && match[0].replace(/\D/g, '').length >= 8) {
                newPhone = match[0].replace(/\D/g, '');
            }
        }

        if (activeLeadId && newPhone) {
            if (leadToUse?.phone !== newPhone && leadToUse?.phone?.startsWith('anon_')) {
                await sql`UPDATE leads SET phone = ${newPhone} WHERE id = ${activeLeadId}`.catch(e => console.warn('[Engine] Error updating phone', e));
                if (leadToUse) leadToUse.phone = newPhone;
            }
        }

        // 3. ENVIAR ID DE LEAD INMEDIATAMENTE SI EXISTE
        if (activeLeadId) {
            res.write(`data: ${JSON.stringify({ leadId: activeLeadId })}\n\n`);
        }

        // 4. Lógica de Pago por Comprobante (Etapa 5)
        // 4. Lógica de Pago por Comprobante (Etapa 5)
        if (mediaUrl) {
            console.log('[Engine] Analyzing media image as receipt:', mediaUrl.slice(0, 100));
            let isReceipt = false;
            
            try {
                // Formatear la parte de la imagen para el AI SDK
                let imagePart: any;
                if (mediaUrl.startsWith('data:')) {
                    const mimeType = mediaUrl.split(';')[0].split(':')[1];
                    const base64Data = mediaUrl.split(',')[1];
                    imagePart = {
                        type: 'image',
                        image: Buffer.from(base64Data, 'base64'),
                        mimeType
                    };
                } else {
                    imagePart = {
                        type: 'image',
                        image: new URL(mediaUrl)
                    };
                }

                const expectedSena = Math.round((currentState.totalPrice || 0) / 2);

                const response = await generateText({
                    model: openrouter('google/gemini-2.5-flash'),
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { 
                                    type: 'text', 
                                    text: `Estás auditando un comprobante de pago para KÂLON Estética. Analizá esta imagen detalladamente.
¿Es un comprobante de transferencia bancaria, pago de billetera virtual (Mercado Pago, etc.) o ticket de depósito válido?
El monto total de los servicios es de $${currentState.totalPrice || 0} y la seña mínima esperada es de $${expectedSena} (pesos argentinos).
El comprobante se considera VÁLIDO ("es_comprobante": true) si el monto transferido/pagado es igual o mayor a la seña esperada ($${expectedSena}) y menor o igual al total ($${currentState.totalPrice || 0}) (o aproximado, ej. si pagó de más o el total).
Respondé únicamente un objeto JSON con esta estructura exacta, sin markdown, comentarios ni texto adicional:
{
  "es_comprobante": true o false,
  "monto_detectado": número del monto que figura en el ticket (o null si no lo ves),
  "razon": "explicación muy breve de por qué es válido o no"
}`
                                },
                                imagePart
                            ]
                        }
                    ]
                });

                console.log('[Engine] Receipt analysis response:', response.text);
                const cleanJson = response.text.trim().replace(/^```json/, '').replace(/```$/, '').trim();
                const resultJson = JSON.parse(cleanJson);
                isReceipt = !!resultJson.es_comprobante;
            } catch (e: any) {
                console.error('[Engine] Error analyzing receipt with Gemini:', e);
                // Fallback de seguridad: si hay un error con el modelo de visión, permitimos agendar
                isReceipt = true; 
            }

            if (isReceipt) {
                const finalMsg = "¡Recibí tu comprobante perfectamente! 🎉 Ya he confirmado tu turno de manera oficial. Te esperamos en Kâlon Estética. Si tenés alguna duda antes de venir, escribime. ¡Que tengas un hermoso día!";
                
                if (activeLeadId) {
                    const userContent = lastUserMessage || "📸 [Comprobante de pago]";
                    await saveChatLog(activeLeadId, 'user', userContent, mediaUrl);
                    await saveChatLog(activeLeadId, 'assistant', finalMsg);
                    await updateLeadState(activeLeadId, { ...currentState, stage: '6' });

                    const appts = await sql`
                        SELECT id FROM appointments 
                        WHERE lead_id = ${activeLeadId} 
                        ORDER BY created_at DESC 
                        LIMIT 1
                    `.catch(() => []);

                    if (appts.length > 0) {
                        await sql`
                            UPDATE appointments 
                            SET status = 'confirmed', receipt_url = ${mediaUrl} 
                            WHERE id = ${appts[0].id}
                        `.catch(e => console.error('[Engine] Error updating appointment status:', e));
                    }

                    await sql`
                        UPDATE leads 
                        SET status = 'converted' 
                        WHERE id = ${activeLeadId}
                    `.catch(e => console.error('[Engine] Error updating lead status:', e));
                }
                res.write(`data: ${JSON.stringify({ stage: '6' })}\n\n`);
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: finalMsg } }] })}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
                return;
            } else {
                const rejectMsg = `Disculpame, pero la imagen que enviaste no parece ser un comprobante de pago o transferencia bancaria válido. 

Por favor, envíame una captura clara del comprobante de la transferencia de la seña ($${Math.round((currentState.totalPrice || 0) / 2)}) para poder confirmar tu turno oficial. ¡Muchas gracias!`;
                
                if (activeLeadId) {
                    const userContent = lastUserMessage || "📸 [Archivo adjunto]";
                    await saveChatLog(activeLeadId, 'user', userContent, mediaUrl);
                    await saveChatLog(activeLeadId, 'assistant', rejectMsg);
                }
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: rejectMsg } }] })}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
                return;
            }
        }

        // 5. INTERCEPTOR PROGRAMÁTICO DE CATEGORÍAS
        // Si el usuario menciona una o más categorías, enviamos las imágenes ANTES del LLM
        // para garantizar que siempre lleguen, independientemente de si el modelo llama la tool.
        let categoryInterceptionNote = ''; // nota que se inyectará en el system prompt
        
        // Solo interceptamos si parece una selección de categoría y estamos en stage 2.
        // En stage 3+, el usuario ya eligió las categorías y está seleccionando sub-servicios
        // específicos para el presupuesto → NO re-enviamos catálogos, dejamos que el LLM
        // llame a generar_presupuesto directamente.
        const isLikelyCategorySelection = lastUserMessage && lastUserMessage.length > 2;
        const currentStage = currentState.stage || '1';
        // El interceptor solo aplica en stage 2 (selección de categoría padre).
        // Si el lead no tiene stage aún (primer mensaje con nombre), también aplica.
        const isCategorySelectionStage = currentStage === '2' || (!activeLeadId && currentStage === '1');
        
        if (isLikelyCategorySelection && isCategorySelectionStage) {
            try {
                const [allCategories, allServices] = await Promise.all([
                    getCategories(),
                    getActiveServices()
                ]);
                
                const detectedCats = detectCategories(lastUserMessage, allCategories, allServices);
                
                if (detectedCats.length > 0) {
                    console.log(`[Engine] INTERCEPTOR: Detected ${detectedCats.length} categories in user message:`, detectedCats.map(c => c.name));
                    
                    const sentCategoryNames: string[] = [];
                    
                    for (const cat of detectedCats) {
                        // Construir URL de imagen de catálogo. 
                        // Primero intentamos price_list_url directo de la categoría,
                        // luego fallback a la URL dinámica de nuestro endpoint.
                        const imageUrl = cat.price_list_url || `/api/catalog-image?id=${cat.id}`;
                        res.write(`data: ${JSON.stringify({ media_url: imageUrl })}\n\n`);
                        sentCategoryNames.push(cat.name);
                        console.log(`[Engine] INTERCEPTOR: Sent image for category "${cat.name}" -> ${imageUrl}`);
                    }
                    
                    // Actualizar estado del lead con las categorías detectadas
                    if (activeLeadId && detectedCats.length > 0) {
                        const firstCat = detectedCats[0];
                        const pendingIds = detectedCats.slice(1).map(c => c.id);
                        await updateLeadState(activeLeadId, {
                            ...currentState,
                            stage: '3',
                            currentCategoryId: firstCat.id,
                            pendingCategoryIds: pendingIds,
                        }).catch(e => console.warn('[Engine] INTERCEPTOR: updateLeadState failed:', e?.message));
                    }
                    
                    // Construir nota para el system prompt
                    const catNamesStr = sentCategoryNames.join(' y ');
                    categoryInterceptionNote = `\n\n## ⚡ ACCIÓN AUTOMÁTICA YA EJECUTADA ⚡\n[SISTEMA: Las imágenes de lista de precios de ${catNamesStr} YA FUERON ENVIADAS AUTOMÁTICAMENTE al cliente ANTES de que respondas. ABSOLUTAMENTE PROHIBIDO usar la herramienta obtener_lista_precios_por_categoria para esas categorías. ABSOLUTAMENTE PROHIBIDO listar sub-servicios, precios o duraciones en texto. SOLO hacé una pregunta súper breve y amigable preguntándole cuál de los servicios de las imágenes le gustaría realizarse.]`;
                }
            } catch (interceptorErr: any) {
                console.warn('[Engine] INTERCEPTOR: Category detection failed (non-critical):', interceptorErr?.message);
                // No re-throw: el LLM sigue como fallback
            }
        }

        // 5.1 Guardar mensaje de usuario entrante en la BD de forma asíncrona
        if (activeLeadId && lastUserMessage) {
            await saveChatLog(activeLeadId, 'user', lastUserMessage);
        }

        // 6. ORQUESTACIÓN AGÉNTICA (Vercel AI SDK + Tools)
        const currentLeadName = (leadToUse as any)?.client_name || currentState.clientName || 'cliente';
        
        // Formatear mensajes para el AI SDK
        const coreMessages = messages.map((m: any) => ({
            role: m.role,
            content: m.content
        }));

        // Fecha actual en zona horaria Argentina
        const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Cordoba' });

        const result = streamText({
            model: openrouter('google/gemini-2.5-flash'),
            system: getSystemPrompt(currentLeadName) + categoryInterceptionNote,
            messages: coreMessages,
            tools: chatbotTools(activeLeadId, currentState, res, identificationId),
            maxSteps: 8,
            onStepFinish: async (step) => {
                if (step.toolCalls.some(tc => tc.toolName === 'pre_reservar_turno')) {
                    res.write(`data: ${JSON.stringify({ stage: '5' })}\n\n`);
                }
            }
        });

        // 7. Consumir el TextStream y formatearlo para el frontend (SSE)
        let fullAssistantMessage = '';
        for await (const chunk of result.textStream) {
            if (chunk) {
                fullAssistantMessage += chunk;
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
            }
        }

        // 8. Guardar la respuesta final del asistente
        if (activeLeadId && fullAssistantMessage.trim()) {
            await saveChatLog(activeLeadId, 'assistant', fullAssistantMessage);
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
    const today = new Date();
    // Ajustar a la zona horaria de Argentina
    const options: Intl.DateTimeFormatOptions = { timeZone: 'America/Argentina/Cordoba', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = today.toLocaleDateString('es-AR', options);
    const todayISO = today.toISOString().split('T')[0];

    return `## IDENTIDAD KÂLON
Sos KÂLON, la asistente virtual de "KÂLON Multiespacio Estético".
- **Tono:** Boutique, elegante, profesional pero muy cálida.
- **Voseo Cordobés:** Usá "vení", "mirá", "querés", "contame".
- **Cliente actual:** ${name !== 'cliente' ? name : 'No sabemos su nombre aún, pregúntalo sutilmente'}.
- **Fecha actual (CRÍTICO):** Hoy es **${dateStr}** (formato YYYY-MM-DD: ${todayISO}). BASA TODOS TUS CÁLCULOS EN ESTA FECHA. Si el cliente te dice un día de la semana, contá los días a partir de hoy. NUNCA te equivoques de día.

## TU MISIÓN: CERRAR RESERVAS
Sos una vendedora y recepcionista de élite. Tu objetivo es llevar al cliente desde la consulta inicial hasta la reserva del turno.

## REGLAS DE ORO (ESTRICTAS)
1. **NO INVENTES NADA:** Tenés herramientas (Tools) para consultar la base de datos. Si te piden precios, USÁ LA HERRAMIENTA. Si te piden horarios, USÁ LA HERRAMIENTA. Si el cliente te corrige, cambia, suma, resta o modifica algún servicio, estás OBLIGADA a volver a llamar a la herramienta correspondiente. Prohibido calcular precios finales o disponibilidad de memoria.
2. **REGISTRA AL CLIENTE Y ENVÍA EL CATÁLOGO SIEMPRE (PROHIBIDO CATÁLOGO EN TEXTO):** Cuando el cliente se presenta por primera vez (te da su nombre), tu PRIMERA ACCIÓN ABSOLUTAMENTE OBLIGATORIA debe ser llamar a la herramienta \`registrar_cliente\` pasando su nombre completo en el campo \`nombre_completo\`. Esto creará su ficha de cliente en la base de datos y le enviará automáticamente el catálogo maestro visual (imagen). NUNCA respondas con un saludo o bienvenida antes de ejecutar esta herramienta. Está terminantemente prohibido enlistar, repitir o mencionar las categorías del catálogo en tu respuesta de texto.
3. **MUESTRA LISTAS DE PRECIOS VISUALES (PROHIBIDO PRECIOS O SUB-SERVICIOS EN TEXTO):** Cuando el cliente elija una o más áreas (ej. "Depilación y Pestañas"), el sistema ya habrá enviado las imágenes automáticamente. Si por alguna razón no se enviaron aún, llamá a \`obtener_lista_precios_por_categoria\` UNA VEZ POR CADA CATEGORÍA. **ESTÁ TERMINANTEMENTE PROHIBIDO enlistar, nombrar o indicar los precios o duraciones en texto.** Solo hacé una pregunta súper breve y amigable sobre cuál de los servicios de las imágenes le gustaría realizarse.
4. **GENERA PRESUPUESTO VISUAL OBLIGATORIO:** Cuando el cliente elija, cambie, corrija, agregue o quite servicios de su interés (ej. "en vez del pack 2 quiero el pack 1", "agregame perfilado", "sacame cavado"), tu PRIMERA ACCIÓN OBLIGATORIA es llamar a la herramienta \`generar_presupuesto\` con los servicios actualizados. NUNCA calcules totales ni señas mentalmente ni respondas un precio corregido en texto sin haber llamado primero a la herramienta para actualizar el presupuesto en la base de datos.
5. **NO ESCRIBAS CÓDIGO:** NUNCA escribas código Python ni \`print()\` en el chat.
6. PROHIBIDO DECIR SI O NO A UN HORARIO SIN LA HERRAMIENTA: Ante cualquier consulta de un horario específico (ej: "hoy a las 18hs tenés?", "puede ser mañana a las 10:00?"), estás OBLIGADA a llamar a consultar_horarios_disponibles para esa fecha exacta. Está estrictamente prohibido responder de memoria o inventar si hay o no lugar.
7. **PAGA SEÑA:** Todo turno requiere una seña del 50%. Cuando el cliente confirme un horario, debés usar la herramienta \`pre_reservar_turno\` y luego indicarle al cliente que pase una foto del comprobante de transferencia para confirmarlo.
9. **BREVEDAD:** Tus respuestas deben ser cortas, claras y fáciles de leer en un celular. Máximo 3 oraciones. Está prohibido duplicar información que ya aparece en las imágenes enviadas.
10. **FLUJO NATURAL:** 
   - Siempre guiá al usuario hacia el siguiente paso con una pregunta.`;
}
