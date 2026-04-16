import { streamText } from 'ai';
import { getKalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { saveChatLog } from './_services/db.js';

/**
 * Chatbot KÂLON - Versión Edge Optimizada para compatibilidad SSE Legacy.
 * Emite en formato OpenAI para que el frontend actual pueda parsear los mensajes.
 */

export const config = {
  runtime: 'edge',
};

export const maxDuration = 60;

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  try {
    const { messages, leadId, initId } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Messages are required' }), { status: 400 });
    }

    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    
    // Log user message (Fire and Forget)
    if (lastUserMessage?.content && leadId) {
      saveChatLog(leadId, 'user', lastUserMessage.content).catch(err => 
        console.error('[api/chat] Error logging user message:', err)
      );
    }

    const model = getKalonModel();
    const system = getSystemPrompt(leadId || null, messages.length);
    const aiTools = buildTools(leadId || null, 'kalon-estetica', initId || null);

    const result = streamText({
      model,
      system,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content
      })),
      tools: aiTools,
      maxSteps: 5,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, any>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        let fullAssistantMessage = "";

        try {
          for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
              fullAssistantMessage += part.textDelta;
              send({
                choices: [{
                  delta: { content: part.textDelta }
                }]
              });
            }

            if (part.type === 'tool-result') {
              const { toolName, result: toolResults } = part;
              
              // 1. PERSISTENCIA DE IDENTIDAD: Capturamos el leadId si se acaba de crear
              if (toolName === 'registrar_cliente' && (toolResults as any).leadId) {
                console.log(`[STREAM] Nuevo Lead detectado: ${(toolResults as any).leadId}`);
                send({ leadId: (toolResults as any).leadId });
              }

              // 2. INYECCIÓN DE IMÁGENES SATORI: Para Categorías y Servicios
              if (toolName === 'listar_categorias_principales' || toolName === 'consultar_servicios') {
                const results = toolResults as any;
                
                // Si ya tenemos una imagen pre-generada de la lista de precios, la usamos directamente
                if (toolName === 'consultar_servicios' && results.price_list_url) {
                    console.log(`[CHAT LOG] Using PRE-GENERATED Price List URL for ${toolName}`);
                    send({
                        choices: [{
                            delta: { content: "", media_url: results.price_list_url }
                        }]
                    });
                } else {
                    // Si no hay imagen guardada, recurrimos a generarla al vuelo (fallback)
                    const isCategory = toolName === 'listar_categorias_principales';
                    const title = isCategory ? 'Categorías de Especialidad' : 'Nuestros Servicios';
                    
                    const items = Array.isArray(results) ? results : results.servicios || [];
                    
                    const menuData = items.map((item: any) => ({
                        label: item.nombre || item.label || 'Servicio',
                        price: item.price ? `$${item.price}` : undefined
                    }));

                    if (menuData.length > 0) {
                        const encodedData = Buffer.from(JSON.stringify(menuData)).toString('base64');
                        const host = req.headers.get('host') || 'kalon-estetica.vercel.app';
                        const protocol = host.includes('localhost') ? 'http' : 'https';
                        const satoriUrl = `${protocol}://${host}/api/satori-image?title=${encodeURIComponent(title)}&data=${encodedData}`;

                        console.log(`[CHAT LOG] Generated On-the-fly Satori URL for ${toolName}: ${satoriUrl}`);

                        send({
                            choices: [{
                                delta: { content: "", media_url: satoriUrl }
                            }]
                        });
                    }
                }
              }
            }
          }

          // Log assistant message (Fire and Forget)
          if (fullAssistantMessage && leadId) {
            saveChatLog(leadId, 'assistant', fullAssistantMessage).catch(err =>
              console.error('[api/chat] Error logging assistant message:', err)
            );
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('[api/chat] Stream Error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: unknown) {
    console.error('[api/chat] Fatal Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
