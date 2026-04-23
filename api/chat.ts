import { streamText, convertToCoreMessages } from 'ai';
import { getKalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { saveChatHistory, createLead, sql, getCategories } from './_services/db.js';

export const runtime = 'edge';
export const maxDuration = 60;

export default async function handler(req: Request | any) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // Parser de Body Universal
    let body: any;
    try {
      if (typeof req.json === 'function') {
        body = await req.json();
      } else if ((req as any).body && typeof (req as any).body === 'object') {
        body = (req as any).body;
      } else {
        const text = await req.text();
        body = JSON.parse(text || '{}');
      }
    } catch (e) {
      console.error('[api/chat] Error parsing body:', e);
      body = {};
    }

    const { messages = [], identificationId, leadId: bodyLeadId, initId } = body;
    const rawLeadId = bodyLeadId || identificationId;
    // Sanitización robusta del uuid para evitar fantasmas
    const leadId = (rawLeadId && typeof rawLeadId === 'string' && rawLeadId.length > 5 && rawLeadId !== 'null' && rawLeadId !== 'undefined') ? rawLeadId : null;
    const safeInitId = initId && typeof initId === 'string' ? initId : null;

    let argentinaTime = new Date().toISOString();
    try {
      argentinaTime = new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Cordoba" });
      console.log('[api/chat] Local time:', argentinaTime);
    } catch (e) {
      console.warn('[api/chat] LocalTime failed, using ISO');
    }

    console.log('[api/chat] Incoming messages:', messages?.length);
    
    const coreMessages = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || ''),
    })).filter((m: any) => m.content.trim() !== '');

    // 1. Iniciamos el stream de texto con el modelo configurado
    let finalSystemPrompt = getSystemPrompt(leadId, argentinaTime);
    
    // 1. DETERMINISTIC DISPATCHER (ESTRUCTURA TIPO N8N/WORKFLOW)
    // Si no hay leadId y el último mensaje parece un nombre, forzamos la ejecución
    // resolviendo el evento COMPLETAMENTE en backend, Bypaseando la IA 100% como un nodo n8n.
    const lastUserMessage = coreMessages.filter((m: any) => m.role === 'user').pop();
    const isNewOrAnonymous = !leadId || leadId.startsWith('temp_') || leadId.startsWith('anon_');
    if (isNewOrAnonymous && lastUserMessage) {
        const text = lastUserMessage.content.trim();
        const isGreeting = ['hola', 'buenas', 'buen dia', 'buenas tardes', 'holis', 'como estas'].includes(text.toLowerCase());
        const isNamePattern = text.length > 2 && !isGreeting;
        
        if (isNamePattern && coreMessages.length <= 5) {
             console.log('[api/chat] DETERMINISTIC DISPATCHER: Triggered for:', text);
             
             // A) Lógica de Registro (Atomic)
             const tempPhone = `anon_${safeInitId || Date.now()}`;
             const newLead = await createLead(null, text, { phone: tempPhone, source: "chatbot", initId: safeInitId }).catch(() => null) as any;
             const newLeadId = newLead?.id || leadId || `temp_${Date.now()}`;

             // B) Lógica de Catálogo Multi-Imagen (Soporte Base64)
             const [configRows, categories] = await Promise.all([
                 sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []),
                 getCategories().catch(() => [])
             ]);
             
             const mainImageUrl = (configRows && configRows.length > 0) ? configRows[0].value : 'https://aayqjixylnnjofnujlnv.supabase.co/storage/v1/object/public/kalon-catalog/catalog-default.jpg';
             
             const assistantMsg = `¡Un gusto conocerte, ${text}! ✨ Te dejo nuestro catálogo arriba para que lo mires. Contame, ¿qué servicio o tratamiento te interesa?`;

             // C) Guardado Histórico
             await saveChatHistory(newLeadId, [
                ...messages,
                { role: 'assistant', content: assistantMsg }
             ]).catch(e => console.error('[api/chat] Save failed:', e));

             // D) Retorno Mock Stream con TODAS las imágenes (incluyendo Base64)
             const encoder = new TextEncoder();
             const fakeStream = new ReadableStream({
                start(controller) {
                    const send = (data: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                    send({ leadId: newLeadId });
                    
                    // Enviamos el catálogo principal
                    send({ media_url: mainImageUrl });
                    
                    // Enviamos las imágenes de las categorías (Base64 o URL)
                    categories.forEach((cat: any) => {
                        const img = cat.price_list_url || cat.image_url;
                        if (img && img.length > 20) { // Evitar vacíos o placeholders cortos
                            send({ media_url: img });
                        }
                    });

                    send({ choices: [{ delta: { content: assistantMsg } }] });
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                }
             });

             return new Response(fakeStream, {
                headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
             });
        }
    }

    const result = await streamText({
      model: getKalonModel(),
      messages: coreMessages,
      system: finalSystemPrompt,
      tools: buildTools(leadId, null, safeInitId || identificationId), // Usamos safeInitId
      maxSteps: 10,
      maxTokens: 1000, 
      temperature: 0,
    });

    console.log('[api/chat] streamText initialized');

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
          for await (const part of result.fullStream as any) {
            console.log(`[api/chat] Part: ${part.type}`);

            if (part.type === 'error') {
              console.error('[api/chat] Stream part error:', part.error);
              const err = part.error as any;
              if (err.status === 402 || (err.message && err.message.includes('credit'))) {
                send({ choices: [{ delta: { content: "¡Hola! Estoy teniendo un ajuste técnico. Por favor, contactanos por WhatsApp al +54 9 11 3654-4865. ✨" } }] });
                hasSentContent = true;
              }
            }

            if (part.type === 'tool-call') {
              hasSentContent = true;
              console.log(`[TOOL] ${part.toolName}`);
            }

            if (part.type === 'text-delta') {
              fullAssistantMessage += part.textDelta;
              hasSentContent = true;
              send({ choices: [{ delta: { content: part.textDelta } }] });
            }

            if (part.type === 'tool-result') {
              const res = part.result as any;
              
              // 1. Extraer Lead ID si existe
              if (res.leadId) {
                currentLeadId = res.leadId;
                send({ leadId: res.leadId });
              }

              // 2. Extraer TODAS las URLs de medios (Recursivo para colecciones)
              const sentUrls = new Set<string>();
              const extractMedia = (obj: any) => {
                if (!obj) return;
                if (typeof obj === 'string') {
                  const isUrl = obj.startsWith('http');
                  const isBase64 = obj.startsWith('data:image');
                  if ((isUrl && (obj.match(/\.(jpeg|jpg|gif|png|webp)/i) || obj.includes('supabase'))) || isBase64) {
                    if (!sentUrls.has(obj)) {
                      sentUrls.add(obj);
                      send({ media_url: obj });
                    }
                  }
                  return;
                }
                if (Array.isArray(obj)) {
                  obj.forEach(extractMedia);
                  return;
                }
                if (typeof obj === 'object') {
                  // Prioridad a campos conocidos, aceptarlos aunque no pasen el filtro regex de extensión
                  if (typeof obj.price_list_url === 'string' && obj.price_list_url.startsWith('http')) {
                    if (!sentUrls.has(obj.price_list_url)) {
                      sentUrls.add(obj.price_list_url);
                      send({ media_url: obj.price_list_url });
                    }
                  }
                  if (typeof obj.image_url === 'string' && obj.image_url.startsWith('http')) {
                    if (!sentUrls.has(obj.image_url)) {
                      sentUrls.add(obj.image_url);
                      send({ media_url: obj.image_url });
                    }
                  }
                  
                  // Crawl resto de propiedades (evitando ciclos básicos si los hubiera)
                  Object.keys(obj).forEach(key => {
                    if (key !== 'price_list_url' && key !== 'image_url') {
                      extractMedia(obj[key]);
                    }
                  });
                }
              };
              
              extractMedia(res);
            }
          }

          if (!hasSentContent) {
            console.warn('[api/chat] Empty stream - Forcing instruction');
            send({ choices: [{ delta: { content: "¡Un gusto! ✨ Por favor, decime tu nombre para que pueda mostrarte nuestro catálogo y ayudarte con tu reserva." } }] });
          }

          // Guardar historial
          if (fullAssistantMessage && currentLeadId) {
            await saveChatHistory(currentLeadId, [
              ...messages,
              { role: 'assistant', content: fullAssistantMessage }
            ]).catch(e => console.error('[api/chat] Save failed:', e));
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error: any) {
          console.error('[api/chat] Loop error:', error);
          if (!hasSentContent) {
            send({ choices: [{ delta: { content: "Hubo un error momentáneo. ¿Podrías intentar de nuevo? 😊" } }] });
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
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
    console.error('[api/chat] Global Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
