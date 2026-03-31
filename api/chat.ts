import { streamText, createDataStreamResponse } from 'ai';
import { getKalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { saveChatLog } from './_services/db.js';

export const config = {
    maxDuration: 60,
};

export const runtime = 'edge';

/**
 * Chatbot KÂLON - Versión Edge Optimizada para OpenRouter/Gemini.
 * Incluye inyección de imágenes dinámicas y persistencia en base de datos.
 */
export default async function handler(req: Request) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 200 });

    try {
        const { messages, leadId, initId } = await req.json();

        if (!messages || !Array.isArray(messages)) {
            return new Response(JSON.stringify({ error: 'Mensajes inválidos' }), { status: 400 });
        }

        const lastUserMessage = messages[messages.length - 1];
        if (lastUserMessage?.role === 'user' && leadId) {
            // Guardar log del usuario de forma asíncrona (fire and forget en el edge)
            saveChatLog(leadId, 'user', lastUserMessage.content).catch(console.error);
        }

        console.log(`[api/chat] Chat Start - leadId: ${leadId || 'new'} | msgCount: ${messages.length}`);
        
        // 1. Obtener Modelo y Prompt
        const model = getKalonModel();
        const system = getSystemPrompt(leadId, messages.length);

        // 2. Instanciar herramientas
        const aiTools = buildTools(leadId || null, 'kalon-estetica', initId || null);

        // 3. Ejecutar stream con herramientas
        const result = streamText({
            model,
            messages,
            system,
            tools: aiTools,
            maxSteps: 5,
            onFinish: async (event) => {
                // Guardar la respuesta del asistente en chat_logs
                if (leadId && event.text) {
                    await saveChatLog(leadId, 'assistant', event.text).catch(console.error);
                }
            }
        });

        const processedToolCalls = new Set<string>();

        // 4. Retornar el stream
        return createDataStreamResponse({
            execute: async (dataStream) => {
                const stream = result.fullStream;
                for await (const part of stream) {
                    // Mapear partes del stream al formato DataStream de Vercel
                    switch (part.type) {
                        case 'text-delta':
                            dataStream.write(`0:${JSON.stringify(part.textDelta)}\n`);
                            break;
                        case 'tool-call':
                            dataStream.write(`9:${JSON.stringify({
                                toolCallId: part.toolCallId,
                                toolName: part.toolName,
                                args: part.args,
                            })}\n`);
                            break;
                        case 'tool-result': {
                            dataStream.write(`a:${JSON.stringify({
                                toolCallId: part.toolCallId,
                                toolName: part.toolName,
                                result: part.result,
                            })}\n`);
                            
                            // Lógica de inyección Satori
                            const { toolName, result: toolResult, toolCallId } = part;
                            if (['listar_categorias_principales', 'consultar_servicios'].includes(toolName) && !processedToolCalls.has(toolCallId)) {
                                processedToolCalls.add(toolCallId);
                                
                                let finalItems: any[] = [];
                                let title = 'Nuevas Especialidades';

                                if (toolName === 'listar_categorias_principales') {
                                    finalItems = Array.isArray(toolResult) ? toolResult : ((toolResult as any).categorias || []);
                                    title = 'NUESTRAS ESPECIALIDADES';
                                } else {
                                    finalItems = (toolResult as any).servicios || [];
                                    if (finalItems.length > 0) {
                                        const firstService = finalItems[0];
                                        const catName = firstService.category || firstService.categoria || firstService.category_name || 'ESTETICA';
                                        title = `SERVICIOS DE ${String(catName).toUpperCase()}`;
                                    }
                                }

                                const normalized = finalItems.map(item => ({
                                    label: item.nombre || item.name || item.title || item.label || "Servicio",
                                    price: item.price || item.precio,
                                    category: item.category || item.categoria || item.category_name
                                })).filter(i => i.label !== "Servicio");

                                if (normalized.length > 0) {
                                    const urlObj = new URL(req.url);
                                    const baseUrl = `${urlObj.protocol}//${urlObj.host}/api/satori-image`;
                                    const encodedData = btoa(JSON.stringify(normalized));
                                    const imageUrl = `${baseUrl}?title=${encodeURIComponent(title)}&data=${encodedData}`;
                                    
                                    // Inyectar como un nuevo fragmento de texto
                                    const markdown = `\n\n![services_image](${imageUrl})\n\n`;
                                    dataStream.write(`0:${JSON.stringify(markdown)}\n`);
                                    console.log(`[api/chat] Satori URL Injected`);
                                }
                            }
                            break;
                        }
                        case 'finish':
                            dataStream.write(`d:${JSON.stringify(part)}\n`);
                            break;
                    }
                }
            },
            onError: (error) => {
                console.error('[api/chat] Stream Error:', error);
                return 'Perdón, tuve un problemita técnico. ¿Podés repetir eso?';
            },
        });

    } catch (error: any) {
        console.error('[api/chat] Fatal Error:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
