import { streamText, convertToCoreMessages } from 'ai';
import { getKalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { saveChatLog } from './_services/db.js';

export const config = {
  runtime: 'edge',
};

export const maxDuration = 60;

export async function POST(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  try {
    const { messages, leadId: bodyLeadId, identificationId, initId: bodyInitId } = await req.json();
    const leadId = bodyLeadId || identificationId;
    const initId = bodyInitId || (identificationId?.includes('-') ? identificationId : null);

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Messages are required' }), { status: 400 });
    }

    // Log user message
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMessage?.content && leadId) {
      saveChatLog(leadId, 'user', String(lastUserMessage.content)).catch(() => {});
    }

    const model = getKalonModel(); // GPT-4o-mini es más estable para tools
    const system = getSystemPrompt(leadId || null, messages.length);
    const aiTools = buildTools(leadId || null, 'kalon-estetica', initId || null);

    const result = streamText({
      model,
      system,
      messages: convertToCoreMessages(messages),
      tools: aiTools,
      maxSteps: 15,
      maxTokens: 1500,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, any>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch (e) {}
        };

        let fullAssistantMessage = "";
        let currentLeadId = leadId;
        let hasSentContent = false;

        try {
          for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
              fullAssistantMessage += part.textDelta;
              hasSentContent = true;
              send({ choices: [{ delta: { content: part.textDelta } }] });
            }

            if (part.type === 'tool-result') {
              const { toolName, result: toolResults } = part;
              const results = toolResults as any;
              hasSentContent = true; 
              
              if (results.message) {
                send({ choices: [{ delta: { content: results.message } }] });
                fullAssistantMessage += results.message;
              }

              if (toolName === 'registrar_cliente' && results.leadId) {
                currentLeadId = results.leadId;
                send({ leadId: results.leadId });
              }

              const catalogs = Array.isArray(results.catalogs) ? results.catalogs : (results.id ? [results] : []);
              if (catalogs.length > 0) {
                for (const cat of catalogs) {
                  const savedUrl = cat.price_list_url || cat.main_catalog_url || cat.priceListUrl;
                  if (savedUrl) {
                    send({ media_url: savedUrl, choices: [{ delta: { content: "" } }] });
                    hasSentContent = true;
                  } else if (cat.servicios || cat.categorias) {
                    const title = (cat.categoria || cat.category_name || 'Nuestros Servicios');
                    const items = cat.servicios || cat.categorias || [];
                    if (items.length > 0) {
                      const menuData = items.map((i: any) => ({
                        label: i.nombre || i.label || i.title || 'Servicio',
                        price: i.precio || i.price ? (String(i.precio || i.price).startsWith('$') ? (i.precio || i.price) : `$${i.precio || i.price}`) : undefined
                      }));
                      const host = req.headers.get('host') || 'kalon-estetica.vercel.app';
                      const protocol = host.includes('localhost') ? 'http' : 'https';
                      const satoriUrl = `${protocol}://${host}/api/satori-image?title=${encodeURIComponent(title)}&data=${Buffer.from(JSON.stringify(menuData)).toString('base64')}`;
                      send({ media_url: satoriUrl, choices: [{ delta: { content: "" } }] });
                      hasSentContent = true;
                    }
                  }
                }
              }
            }
          }

          if (!hasSentContent) {
            send({ choices: [{ delta: { content: "¡Ups! Estoy afinando los últimos detalles. ¿Podrías repetirme eso? ✨" } }] });
          }

          if (fullAssistantMessage && currentLeadId) {
            saveChatLog(currentLeadId, 'assistant', fullAssistantMessage).catch(() => {});
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('[api/chat] Error en el stream:', error);
          if (!hasSentContent) {
            send({ choices: [{ delta: { content: "Ocurrió un error. Por favor intentá enviar el mensaje de nuevo." } }] });
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
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

  } catch (error: any) {
    console.error('[api/chat] Error en la API:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
