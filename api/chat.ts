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

    const { messages = [], identificationId } = body;
    const leadId = identificationId || null;

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
    const result = await streamText({
      model: getKalonModel(),
      messages: coreMessages,
      system: getSystemPrompt(leadId, argentinaTime),
      tools: buildTools(leadId, null, identificationId),
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
              const extractMedia = (obj: any) => {
                if (!obj) return;
                if (typeof obj === 'string') {
                  if (obj.startsWith('http') && (obj.match(/\.(jpeg|jpg|gif|png|webp)/i) || obj.includes('supabase'))) {
                    send({ media_url: obj });
                  }
                  return;
                }
                if (Array.isArray(obj)) {
                  obj.forEach(extractMedia);
                  return;
                }
                if (typeof obj === 'object') {
                  if (obj.price_list_url) send({ media_url: obj.price_list_url });
                  if (obj.image_url) send({ media_url: obj.image_url });
                  
                  // Crawl properties
                  Object.values(obj).forEach(extractMedia);
                }
              };
              
              extractMedia(res);
            }
          }

          if (!hasSentContent) {
            console.warn('[api/chat] Empty stream');
            send({ choices: [{ delta: { content: "¡Hola! ✨ Soy tu asistente de Kâlon. ¿Me podrías decir tu nombre para comenzar?" } }] });
          }

          // Guardar historial
          if (fullAssistantMessage && currentLeadId) {
            await saveChatHistory(currentLeadId, [
              ...messages,
              { role: 'assistant', content: fullAssistantMessage }
            ]).catch(e => console.error('[api/chat] Save failed:', e));
          }

          send('[DONE]');
        } catch (error: any) {
          console.error('[api/chat] Loop error:', error);
          if (!hasSentContent) {
            send({ choices: [{ delta: { content: "Hubo un error momentáneo. ¿Podrías intentar de nuevo? 😊" } }] });
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
    console.error('[api/chat] Global Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
