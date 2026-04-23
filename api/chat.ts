import OpenAI from 'openai';
import { saveChatHistory, createLead, sql, getCategories, getServicesByCategory } from './_services/db.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
});

/**
 * CHATBOT HÍBRIDO KÂLON (v2.0)
 * Lógica: DETERMINÍSTICA para el inicio (Catálogo) + IA (OpenRouter) para el resto.
 */
export default async function handler(req: Request | any) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 200 });

    try {
        const body = await req.json();
        const { messages = [], leadId, safeInitId } = body;
        const lastMessage = messages[messages.length - 1];
        const text = lastMessage?.content?.trim() || '';

        console.log(`[api/chat] HYBRID-BOT: Input="${text}" | LeadId=${leadId}`);

        // --- 1. FLUJO DETERMINÍSTICO (Prioridad: Velocidad y Entrega de Catálogo) ---

        // A) Saludo inicial
        if (messages.length === 0 || (messages.length === 1 && (text.toLowerCase() === 'hola' || text.toLowerCase() === 'hi'))) {
            return sendStaticResponse("¡Hola! ✨ Bienvenida a Kâlon Estética. ¿Con quién tengo el gusto de hablar? (Decime tu nombre para empezar)");
        }

        // B) Captura de Nombre e Identificación
        const isGreeting = text.toLowerCase().length < 5 && (text.toLowerCase().includes('hola') || text.toLowerCase().includes('buen'));
        if (!leadId && !isGreeting && text.length >= 2) {
            console.log('[api/chat] FLOW: Registrando nuevo lead...');
            const [configRows, categories] = await Promise.all([
                sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []),
                getCategories().catch(() => [])
            ]);
            const mainImageUrl = configRows?.[0]?.value || 'https://aayqjixylnnjofnujlnv.supabase.co/storage/v1/object/public/kalon-catalog/catalog-default.jpg';
            const assistantMsg = `¡Un gusto conocerte, ${text}! ✨ Te dejo nuestro catálogo arriba. Contame, ¿qué servicio o tratamiento te interesa hoy?`;

            const tempPhone = `anon_${safeInitId || Date.now()}`;
            const newLead = await createLead(null, text, { phone: tempPhone, source: "chatbot", initId: safeInitId }).catch(() => null) as any;
            const newLeadId = newLead?.id || `temp_${Date.now()}`;

            return sendFlowStream(newLeadId, assistantMsg, [mainImageUrl, ...categories.map((c: any) => c.price_list_url || c.image_url).filter(Boolean)]);
        }

        // C) Match directo de Categoría
        if (leadId) {
             const categories = await getCategories().catch(() => []);
             const matchedCat = categories.find((c: any) => 
                 text.toLowerCase().includes(c.name.toLowerCase())
             );

             if (matchedCat) {
                 const { services } = await getServicesByCategory(matchedCat.id).catch(() => ({ services: [] }));
                 const assistantMsg = `¡Excelente elección! En **${matchedCat.name}** tenemos estos servicios. ¿Cuál te gustaría realizarte?\n\n` + 
                                    services.map((s: any) => `• ${s.name}: $${s.price}`).join('\n');
                 return sendFlowStream(leadId, assistantMsg, [matchedCat.price_list_url || matchedCat.image_url]);
             }
        }

        // --- 2. INTELIGENCIA ARTIFICIAL (Cerebro de OpenRouter) ---
        // Si no entró en el flujo determinístico, le pasamos el mando a la IA.
        console.log('[api/chat] AI: Delegando respuesta a OpenRouter...');

        const systemPrompt = `Eres la asistente virtual experta de Kâlon Estética. 
Tu objetivo es ser amable, boutique y profesional. 
Conoces todos los tratamientos de estética. 
Si el cliente pregunta por precios o servicios específicos, intenta guiarlos basándote en que ya les mostramos el catálogo.
Mantén las respuestas concisas y cálidas. Usa emojis sutiles. ✨`;

        const response = await openai.chat.completions.create({
            model: 'anthropic/claude-3.5-sonnet', // O el modelo que prefieras de OpenRouter
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.map((m: any) => ({ role: m.role, content: m.content }))
            ],
            stream: true,
        });

        const encoder = new TextEncoder();
        const aiStream = new ReadableStream({
            async start(controller) {
                const send = (data: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                
                send({ leadId: leadId || 'temp' });
                
                try {
                    for await (const chunk of response) {
                        const content = chunk.choices[0]?.delta?.content || '';
                        if (content) {
                            send({ choices: [{ delta: { content } }] });
                        }
                    }
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                } catch (e) {
                    console.error('[api/chat] AI Stream Error:', e);
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(aiStream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        });

    } catch (e: any) {
        console.error('[api/chat] CRITICAL ERROR:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

// --- HELPERS ---

function sendStaticResponse(text: string) {
    return new Response(JSON.stringify({
        choices: [{ message: { content: text } }]
    }), { headers: { 'Content-Type': 'application/json' } });
}

function sendFlowStream(leadId: string, text: string, images: string[] = []) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            const send = (data: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            send({ leadId });
            images.forEach(url => { if (url && url.length > 10) send({ media_url: url }); });
            send({ choices: [{ delta: { content: text } }] });
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
        }
    });
    return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
    });
}
