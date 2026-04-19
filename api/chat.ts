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
      maxSteps: 5,
      abortSignal: abortCtrl.signal,
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

            if (part.type === 'error') {
              console.error('[api/chat] AI Error Part:', part.error);
            }

            if (part.type === 'tool-result') {
              const { toolName, result: toolResults } = part;
              
               // 1. PERSISTENCIA DE IDENTIDAD Y AUTO-CATÁLOGO: 
               if (toolName === 'registrar_cliente' && (toolResults as any).leadId) {
                 const newLeadId = (toolResults as any).leadId;
                 send({ leadId: newLeadId });
               }

              // 2. INYECCIÓN DE IMÁGENES: Para Categorías y Servicios
              if (toolName === 'listar_categorias_principales' || toolName === 'consultar_servicios') {
                const results = toolResults as any;
                
                // Si es categorias principales y no tiene price_list_url, usamos la maestra
                if (toolName === 'listar_categorias_principales' && !results.price_list_url) {
                    try {
                        const configResult = await db.execute(sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`);
                        if (configResult && configResult.rows && configResult.rows.length > 0) {
                          results.price_list_url = configResult.rows[0].value;
                        }
                    } catch (e) {}
                }

                // Prioridad 1: Imagen pre-generada de la base de datos (price_list_url)
                const savedUrl = results.price_list_url;
                
                if (savedUrl) {
                    console.log(`[CHAT LOG] Usando imagen GUARDADA para ${toolName}: ${savedUrl}`);
                    send({
                        media_url: savedUrl,
                        choices: [{ delta: { content: "" } }]
                    });
                } else {
                    // Prioridad 2: Generación on-the-fly via Satori
                    const isCategory = toolName === 'listar_categorias_principales';
                    const title = isCategory ? 'Especialidades KÂLON' : 'Nuestros Servicios';
                    
                    const items = Array.isArray(results) ? results : (results.servicios || []);
                    
                    const menuData = items.map((item: any) => ({
                        label: item.nombre || item.label || item.title || 'Servicio',
                        price: item.price ? (String(item.price).startsWith('$') ? item.price : `$${item.price}`) : undefined
                    }));

                    if (menuData.length > 0) {
                        const encodedData = Buffer.from(JSON.stringify(menuData)).toString('base64');
                        const host = req.headers.get('host') || 'kalon-estetica.vercel.app';
                        const protocol = host.includes('localhost') ? 'http' : 'https';
                        
                        const satoriUrl = `${protocol}://${host}/api/satori-image?title=${encodeURIComponent(title)}&data=${encodedData}`;

                        console.log(`[CHAT LOG] Generando imagen SATORI para ${toolName}: ${satoriUrl.substring(0, 100)}...`);

                        send({
                            media_url: satoriUrl,
                            choices: [{ delta: { content: "" } }]
                        });
                    } else {
                        console.warn(`[CHAT LOG] No se pudo generar imagen para ${toolName} (sin items)`);
                    }
                }
              }
            }
          }

          clearTimeout(aiTimeout);

          // Si la IA no generó texto, enviar mensaje de fallback
          if (!fullAssistantMessage) {
            console.error('[api/chat] ALERTA: La IA no generó texto. Enviando fallback.');
            send({
              choices: [{
                delta: { content: "Disculpá, tuve un problema técnico momentáneo. ¿Podés repetirme lo que me decías? ✨" }
              }]
            });
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
          clearTimeout(aiTimeout);
          console.error('[api/chat] Stream Error:', error);
          
          // Enviar error visible al usuario en vez de morir silenciosamente
          try {
            send({
              choices: [{
                delta: { content: "Disculpá, ocurrió un error momentáneo. Por favor intentá de nuevo. ✨" }
              }]
            });
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (e) {
            controller.error(error);
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
