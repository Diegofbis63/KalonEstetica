import { streamText, convertToCoreMessages } from 'ai';
import { getKalonModel, getSystemPrompt } from './_services/ai';
import { buildTools } from './_services/ai_tools';
import { saveChatHistory } from './_services/db';

export const config = {
  maxDuration: 60,
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { messages, clientPhone, mediaUrl, message, identificationId } = await req.json();
    const leadId = identificationId || null;

    // Aumentamos maxSteps para permitir que la IA registre y luego liste servicios en un solo turno
    const result = await streamText({
      model: getKalonModel(),
      messages: convertToCoreMessages(messages),
      system: getSystemPrompt(leadId, messages.length),
      tools: buildTools(leadId, null, identificationId),
      maxSteps: 10,
      onStepFinish: ({ text, toolCalls, toolResults }) => {
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

              // Si la herramienta devuelve un mensaje textual, lo inyectamos en el stream
              if (res.message) {
                send({ choices: [{ delta: { content: res.message } }] });
                fullAssistantMessage += res.message;
              }

              // Manejo de catálogos e imágenes (Satori)
              const catalogs = Array.isArray(res.catalogs) ? res.catalogs : (res.id ? [res] : []);
              if (catalogs.length > 0) {
                for (const cat of catalogs) {
                  const savedUrl = cat.price_list_url || cat.main_catalog_url || cat.priceListUrl;
                  if (savedUrl) {
                    send({ media_url: savedUrl, choices: [{ delta: { content: "" } }] });
                  } else if (cat.servicios || cat.categorias) {
                    // Generación dinámica de imagen si no hay URL estática
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
                    }
                  }
                }
              }
            }

            if (part.type === 'error') {
              console.error('[api/chat] Error en parte del stream:', part.error);
              const err = part.error as any;
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
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
