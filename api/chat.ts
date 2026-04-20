import { streamText, convertToCoreMessages } from 'ai';
import { getKalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { saveChatHistory } from './_services/db.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request | any) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  try {
    // Parser de Body Universal (Edge / Node / Streams)
    let body: any;
    try {
      if (typeof req.json === 'function') {
        body = await req.json();
      } else if ((req as any).body && typeof (req as any).body === 'object') {
        body = (req as any).body;
      } else {
        // Fallback para Node.js puro donde el body es un stream
        const chunks = [];
        const reader = (req as any).body?.getReader?.();
        if (reader) {
          let done = false;
          while (!done) {
            const { value, done: Done } = await reader.read();
            if (value) chunks.push(value);
            done = Done;
          }
          const raw = new TextDecoder().decode(new Uint8Array(chunks.flatMap(c => Array.from(c))));
          body = JSON.parse(raw);
        } else {
          body = {};
        }
      }
    } catch (e) {
      console.error('[api/chat] Error parsing body:', e);
      body = {};
    }

    const { messages = [], identificationId } = body;
    const leadId = identificationId || null;

    // Obtenemos la fecha actual en formato legible (Argentina)
    let argentinaTime = new Date().toISOString();
    try {
      argentinaTime = new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Cordoba" });
      console.log('[api/chat] Local time:', argentinaTime);
    } catch (e) {
      console.warn('[api/chat] LocalTime failed, using ISO');
    }

    // Aumentamos maxSteps para permitir que la IA registre y luego liste servicios en un solo turno
    const result = await streamText({
      model: getKalonModel(),
      messages: convertToCoreMessages(messages),
      system: getSystemPrompt(leadId, argentinaTime),
      tools: buildTools(leadId, null, identificationId),
      maxSteps: 8,
      maxTokens: 500, // Límite seguro (evita error 402) pero suficiente para lógica compleja
      onStepFinish: ({ toolCalls }) => {
        // En el servidor podemos loguear los pasos internos
        if (toolCalls?.length) console.log('[api/chat] Step tools:', toolCalls.map(t => t.toolName));
      }
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch (e) {}
        };

        let fullAssistantMessage = "";
        let currentLeadId = leadId;
        let hasSentContent = false;

        try {
          for await (const part of result.fullStream) {
            // DEBUG: Seguimiento del flujo para el desarrollador (se ignora en el front)
            if (part.type === 'tool-call') console.log(`[TOOL CALL] ${part.toolName}`);

            if (part.type === 'text-delta') {
              fullAssistantMessage += part.textDelta;
              hasSentContent = true;
              send({ choices: [{ delta: { content: part.textDelta } }] });
            }

            if (part.type === 'tool-result') {
              const res = part.result as any;
              hasSentContent = true; 
              
              // Si la herramienta devuelve un ID de lead, lo sincronizamos al front
              if (part.toolName === 'registrar_cliente' && res.leadId) {
                currentLeadId = res.leadId;
                send({ leadId: res.leadId });
              }

              // Manejo de catálogos e imágenes
              const catalogs = Array.isArray(res.catalogs) 
                ? res.catalogs 
                : (res.id || res.price_list_url || res.categorias ? [res] : []);
              
              if (catalogs.length > 0) {
                for (const cat of catalogs) {
                  // 1. Imagen de la categoría (Price List)
                  const catUrl = cat.price_list_url || cat.main_catalog_url || cat.priceListUrl;
                  if (catUrl) {
                    send({ media_url: catUrl, choices: [{ delta: { content: "" } }] });
                  }

                  // 2. Imágenes de servicios individuales si existen
                  if (Array.isArray(cat.servicios)) {
                    for (const srv of cat.servicios) {
                      if (srv.image_url) {
                        send({ media_url: srv.image_url, choices: [{ delta: { content: "" } }] });
                      }
                    }
                  }

                  // 3. Generación dinámica (Satori) si no hay URLs estáticas
                  if (!catUrl && (cat.servicios || cat.categorias)) {
                    const title = (cat.categoria || cat.category_name || 'Nuestros Servicios');
                    const items = cat.servicios || cat.categorias || [];
                    if (items.length > 0) {
                      const menuData = items.map((i: any) => ({
                        label: i.nombre || i.label || i.title || 'Servicio',
                        price: i.precio || i.price ? (String(i.precio || i.price).startsWith('$') ? (i.precio || i.price) : `$${i.precio || i.price}`) : undefined
                      }));
                      const menuDataStr = JSON.stringify(menuData);
                      const base64Data = btoa(encodeURIComponent(menuDataStr).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode(parseInt(p1, 16))));
                      const host = (typeof req.headers.get === 'function' ? req.headers.get('host') : (req.headers as any).host) || 'kalon-estetica.vercel.app';
                      const protocol = host.includes('localhost') ? 'http' : 'https';
                      const satoriUrl = `${protocol}://${host}/api/satori-image?title=${encodeURIComponent(title)}&data=${base64Data}`;
                      send({ media_url: satoriUrl, choices: [{ delta: { content: "" } }] });
                    }
                  }
                }
              }
            }

            if (part.type === 'error') {
              console.error('[api/chat] Error en parte del stream:', part.error);
              const err = part.error as any;
              
              // Diagnostic log for Vercel
              console.error('[Diagnostic] Status:', err.status, 'Message:', err.message);

              if (err.status === 402 || (err.message && err.message.includes('credit'))) {
                 send({ choices: [{ delta: { content: "¡Ups! Me quedé sin créditos momentáneamente. Por favor contactanos por WhatsApp al +54 9 11 1234-5678. 😊" } }] });
                 hasSentContent = true;
              }
            }
          }

          if (!hasSentContent) {
            console.warn('[api/chat] Stream terminó sin enviar contenido.');
            send({ choices: [{ delta: { content: "¡Perfecto! ¿En qué más puedo ayudarte hoy? ✨" } }] });
          }

          // Guardado final del historial
          if (fullAssistantMessage && currentLeadId) {
            await saveChatHistory(currentLeadId, [
              ...messages,
              { role: 'assistant', content: fullAssistantMessage }
            ]).catch(e => console.error('[api/chat] Error DB:', e));
          }

          send('[DONE]');
        } catch (error: any) {
          console.error('[api/chat] Error en bucle del stream:', error);
          if (!hasSentContent) {
            send({ choices: [{ delta: { content: "Tuve un pequeño problema técnico, pero ya estoy de vuelta. ¿Podrías repetirme eso? 😊" } }] });
          }
          send('[DONE]');
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('[api/chat] Error Fatal:', error);
    // Intentamos devolver el error detallado para diagnosticar
    const errorMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    return new Response(JSON.stringify({ error: errorMsg, stack }), { status: 500 });
  }
}
