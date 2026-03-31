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
        const send = (data: any) => {
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
              const { toolName, result: toolResult } = part;
              
              // Satori Image Injection (Legacy Format compatible with src/lib/kalon-chat.ts)
              if (toolName === 'listar_categorias_principales' || toolName === 'consultar_servicios') {
                const isCat = toolName === 'listar_categorias_principales';
                const title = isCat ? 'Categorías' : 'Servicios';
                
                // Format items for the image generator
                const items = isCat 
                  ? (toolResult as any[]).map(c => ({ label: c.nombre }))
                  : (toolResult as any).servicios.map((s: any) => ({ label: s.label, price: s.price }));

                const base64Data = Buffer.from(JSON.stringify(items)).toString('base64');
                const satoriUrl = `https://kalon-estetica.vercel.app/api/satori-image?title=${encodeURIComponent(title)}&data=${encodeURIComponent(base64Data)}&v=${Date.now()}`;
                
                send({ media_url: satoriUrl });
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

  } catch (error: any) {
    console.error('[api/chat] Fatal Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
