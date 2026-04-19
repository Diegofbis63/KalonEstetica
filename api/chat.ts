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

        // Removida inyección proactiva para evitar duplicados. 
        // El AI se encarga de llamar a las herramientas según el flujo.


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
              
               // 1. PERSISTENCIA DE IDENTIDAD Y AUTO-CATÁLOGO: 
               if (toolName === 'registrar_cliente' && (toolResults as any).leadId) {
                 const newLeadId = (toolResults as any).leadId;
                 // Ahora solo vinculamos el ID. El AI decide qué catálogo mostrar según las reglas.
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
                        
                        // Usamos una URL absoluta para asegurar que el componente Img la encuentre
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
