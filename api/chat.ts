import { streamText } from 'ai';
import { getKalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { saveChatLog, db } from './_services/db.js';
import * as schema from './_services/schema.js';
import { eq, sql } from 'drizzle-orm';

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
    const body = await req.json();
    const { messages } = body;
    const leadId = body.leadId || body.identificationId;
    const initId = body.initId || (body.identificationId?.includes('-') ? body.identificationId : null);

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

    // Timeout de 25s para que nunca se cuelgue
    const abortCtrl = new AbortController();
    const aiTimeout = setTimeout(() => abortCtrl.abort(), 25000);

    const result = streamText({
      model,
      system,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content
      })),
      tools: aiTools,
      maxSteps: 15, // Restaurado a 15 (ESTABLE)
      maxTokens: 1000, 
      abortSignal: abortCtrl.signal,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        let fullAssistantMessage = "";
        let currentLeadId = leadId;
        let hasSentContent = false;

        try {
          for await (const part of result.fullStream) {
            console.log(`[DEBUG chat] Part type: ${part.type}`);
            if (part.type === 'text-delta') {
              console.log(`[DEBUG chat] Text Delta: "${part.textDelta}"`);
              fullAssistantMessage += part.textDelta;
              hasSentContent = true;
              send({
                choices: [{
                  delta: { content: part.textDelta }
                }]
              });
            }

            if (part.type === 'error') {
              console.error('[api/chat] AI Internal Error Part:', JSON.stringify(part.error, Object.getOwnPropertyNames(part.error || {}), 2));
              // Si falla después de haber enviado algo, no mostramos el fallback total
              if (hasSentContent) continue;
            }

            if (part.type === 'tool-result') {
              const { toolName, result: toolResults } = part;
              const results = toolResults as Record<string, unknown>;
              hasSentContent = true; 
              
              // 1. Mensajes inyectados (si existen)
              if (results.message) {
                send({ choices: [{ delta: { content: results.message } }] });
                fullAssistantMessage += results.message;
                hasSentContent = true;
              }

              // 2. Persistencia de identidad
              if (toolName === 'registrar_cliente' && results.leadId) {
                currentLeadId = results.leadId as string;
                send({ leadId: results.leadId });
                if (lastUserMessage?.content) {
                  saveChatLog(results.leadId as string, 'user', lastUserMessage.content).catch(e => {
                    console.error('[DEBUG chat] Error guardando log diferido:', e);
                  });
                }
              }

              // 3. Imágenes y Catálogos
              if (toolName === 'listar_categorias_principales' || toolName === 'consultar_servicios') {
                const catalogsToProcess = Array.isArray(results.catalogs) ? results.catalogs : [results];

                for (const cat of (catalogsToProcess as Record<string, unknown>[])) {
                  const savedUrl = (cat.price_list_url || cat.main_catalog_url || cat.priceListUrl) as string | undefined;
                  
                  if (savedUrl) {
                    send({
                      media_url: savedUrl,
                      choices: [{ delta: { content: "" } }]
                    });
                    hasSentContent = true;
                  } else {
                    // Fallback Satori
                    const title = (cat.categoria || cat.category_name || 'Nuestros Servicios');
                    const items = cat.servicios || cat.categorias || [];
                    
                    if (items.length > 0) {
                      const menuData = items.map((i: any) => ({
                        label: i.nombre || i.label || i.title || 'Servicio',
                        price: i.precio || i.price ? (String(i.precio || i.price).startsWith('$') ? (i.precio || i.price) : `$${i.precio || i.price}`) : undefined
                      }));

                      const encodedData = Buffer.from(JSON.stringify(menuData)).toString('base64');
                      const host = req.headers.get('host') || 'kalon-estetica.vercel.app';
                      const protocol = host.includes('localhost') ? 'http' : 'https';
                      const satoriUrl = `${protocol}://${host}/api/satori-image?title=${encodeURIComponent(title)}&data=${encodedData}`;

                      send({
                        media_url: satoriUrl,
                        choices: [{ delta: { content: "" } }]
                      });
                      hasSentContent = true;
                    }
                  }
                }
              }
            }
          }

          clearTimeout(aiTimeout);

          // Si la IA no generó texto y no envió imágenes, enviar mensaje de fallback
          if (!fullAssistantMessage && !hasSentContent) {
            console.warn('[DEBUG chat] No se generó contenido. Enviando mensaje de seguridad.');
            send({
              choices: [{
                delta: { content: "¡Ups! El sistema está afinando detalles, por favor reintentá en un segundito. ✨" }
              }]
            });
          }

          // Log assistant message (Fire and Forget)
          if (fullAssistantMessage && currentLeadId) {
            saveChatLog(currentLeadId, 'assistant', fullAssistantMessage).catch(err =>
              console.error('[api/chat] Error logging assistant message:', err)
            );
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          clearTimeout(aiTimeout);
          console.error('[api/chat] Stream Error:', error);
          
          if (!hasSentContent) {
            try {
              send({
                choices: [{
                  delta: { content: "¡Ups! El sistema está afinando detalles, por favor reintentá en un segundito. ✨" }
                }]
              });
            } catch (e) {
              console.error('[api/chat] Error sending fallback:', e);
            }
          }
          
          try {
            console.log('[api/chat] Finalizing stream after error...');
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (err) {
            console.warn('[api/chat] Stream closure warning:', err);
          }
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
