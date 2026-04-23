import { saveChatHistory, createLead, sql, getCategories, getServicesByCategory } from './_services/db.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * CHATBOT DETERMINÍSTICO "FLOW-BASED" (v1.0)
 * Diseñado para ser 100% confiable y rápido, siguiendo un flujo de etapas (n8n style).
 */
export default async function handler(req: Request | any) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 200 });

    try {
        const body = await req.json();
        const { messages = [], leadId, safeInitId } = body;
        const lastMessage = messages[messages.length - 1];
        const text = lastMessage?.content?.trim() || '';

        console.log(`[api/chat] FLOW-DISPATCHER: Input="${text}" | LeadId=${leadId}`);

        // --- ETAPA 0: Mensaje Inicial ---
        if (messages.length === 0 || (messages.length === 1 && (text.toLowerCase().includes('hola') || text.toLowerCase() === 'hi'))) {
            return sendStaticResponse("¡Hola! ✨ Bienvenida a Kâlon Estética. ¿Con quién tengo el gusto de hablar? (Decime tu nombre para empezar)");
        }

        // --- ETAPA 1: Identificación (Detección de Nombre) ---
        // Si no tenemos leadId y el usuario escribió algo que parece un nombre (más de 2 letras y no es un saludo largo)
        const isGreeting = text.toLowerCase().length < 5 && (text.toLowerCase().includes('hola') || text.toLowerCase().includes('buen'));
        
        if (!leadId && !isGreeting && text.length >= 2) {
            console.log('[api/chat] FLOW: Detectado nombre, iniciando registro...');
            
            // 1. Obtener datos necesarios (Catálogo y Categorías)
            const [configRows, categories] = await Promise.all([
                sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []),
                getCategories().catch(() => [])
            ]);

            const mainImageUrl = (configRows && configRows.length > 0) ? configRows[0].value : 'https://aayqjixylnnjofnujlnv.supabase.co/storage/v1/object/public/kalon-catalog/catalog-default.jpg';
            const assistantMsg = `¡Un gusto conocerte, ${text}! ✨ Te dejo nuestro catálogo arriba. Contame, ¿qué servicio o tratamiento te interesa hoy?`;

            // 2. Crear Lead (Rápido)
            const tempPhone = `anon_${safeInitId || Date.now()}`;
            const newLead = await createLead(null, text, { phone: tempPhone, source: "chatbot", initId: safeInitId }).catch(() => null) as any;
            const newLeadId = newLead?.id || `temp_${Date.now()}`;

            // 3. Responder con Catálogo Multi-Imagen
            return sendFlowStream(newLeadId, assistantMsg, [mainImageUrl, ...categories.map((c: any) => c.price_list_url || c.image_url).filter(Boolean)]);
        }

        // --- ETAPA 2: Selección de Categoría / Servicio ---
        // Si ya tenemos leadId, intentamos ver si el usuario mencionó una categoría
        if (leadId) {
             const categories = await getCategories().catch(() => []);
             const matchedCat = categories.find((c: any) => 
                 text.toLowerCase().includes(c.name.toLowerCase()) || 
                 (c.description && text.toLowerCase().includes(c.description.toLowerCase()))
             );

             if (matchedCat) {
                 console.log(`[api/chat] FLOW: Categoría detectada: ${matchedCat.name}`);
                 const { services } = await getServicesByCategory(matchedCat.id).catch(() => ({ services: [] }));
                 const assistantMsg = `¡Excelente elección! En **${matchedCat.name}** tenemos estos servicios. ¿Cuál te gustaría realizarte?\n\n` + 
                                    services.map((s: any) => `• ${s.name}: $${s.price}`).join('\n');
                 
                 return sendFlowStream(leadId, assistantMsg, [matchedCat.price_list_url || matchedCat.image_url]);
             }
        }

        // --- FALLBACK: AI Inteligente (Solo si falla el flujo determinístico) ---
        // Aquí podrías llamar a OpenAI/Anthropic, pero por ahora vamos a mantenerlo determinístico
        // para garantizar que "funcione" como n8n.
        
        const fallbackMsg = "Entiendo. ¿Te gustaría ver nuestro catálogo de servicios o preferís que te ayude con algo específico?";
        return sendFlowStream(leadId || 'temp', fallbackMsg);

    } catch (e: any) {
        console.error('[api/chat] CRITICAL ERROR:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

// --- HELPERS DE RESPUESTA ---

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
            
            // Enviar imágenes una por una
            images.forEach(url => {
                if (url && url.length > 10) send({ media_url: url });
            });

            // Enviar texto
            send({ choices: [{ delta: { content: text } }] });
            
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    });
}
