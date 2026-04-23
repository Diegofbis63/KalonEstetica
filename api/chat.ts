import OpenAI from 'openai';
import { createLead, sql, getCategories, getServicesByCategory } from './_services/db.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  maxDuration: 60,
};

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || 'sk-or-dummy',
});

/**
 * CHATBOT HÍBRIDO KÂLON (v2.1)
 * Refactorizado a firma estándar de Vercel Node.js para máxima compatibilidad.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Manejo de CORS
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { messages = [], leadId, identificationId } = req.body as { 
            messages: Array<{ role: string; content: string }>;
            leadId?: string | number;
            identificationId?: string;
        };
        const lastMessage = messages[messages.length - 1];
        const text = lastMessage?.content?.trim() || '';

        // --- 1. FLUJO DETERMINÍSTICO (Prioridad: Velocidad y Entrega de Catálogo) ---

        // A) Saludo inicial (Si no hay mensajes o es un "hola" muy corto)
        if (messages.length === 0 || (messages.length === 1 && text.toLowerCase().length < 5 && text.toLowerCase().includes('hola'))) {
            console.log('[api/chat] FLOW: Saludo inicial');
            return res.status(200).json({
                choices: [{ message: { content: "¡Hola! ✨ Bienvenida a Kâlon Estética. ¿Con quién tengo el gusto de hablar? (Decime tu nombre para empezar)" } }]
            });
        }

        // B) Captura de Nombre e Identificación (Si no tenemos leadId)
        const isGreeting = text.toLowerCase().length < 6 && (text.toLowerCase().includes('hola') || text.toLowerCase().includes('buen'));
        if (!leadId && !isGreeting && text.length >= 2) {
            console.log('[api/chat] FLOW: Registrando nuevo lead...');
            
            // Usamos queries directas con timeout para no quedar colgados
            const [configRows, categories] = await Promise.all([
                sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []),
                getCategories().catch(() => [])
            ]);

            const mainImageUrl = configRows?.[0]?.value || 'https://aayqjixylnnjofnujlnv.supabase.co/storage/v1/object/public/kalon-catalog/catalog-default.jpg';
            const assistantMsg = `¡Un gusto conocerte, ${text}! ✨ Te dejo nuestro catálogo arriba. Contame, ¿qué servicio o tratamiento te interesa hoy?`;

            const tempPhone = `anon_${identificationId || Date.now()}`;
            const newLead = await createLead(null, text, { phone: tempPhone, source: "chatbot", initId: identificationId }).catch(() => null) as { id: string | number } | null;
            const newLeadId = newLead?.id || `temp_${Date.now()}`;

            console.log(`[api/chat] FLOW: Lead creado ID=${newLeadId}. Enviando respuesta...`);

            // Para respuestas con imágenes y leadId, usamos un JSON estándar pero enriquecido
            // El frontend kalon-chat.ts sabe parsear media_url
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Accel-Buffering', 'no');

            res.write(`data: ${JSON.stringify({ leadId: newLeadId })}\n\n`);
            res.write(`data: ${JSON.stringify({ media_url: mainImageUrl })}\n\n`);
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: assistantMsg } }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // C) Match directo de Categoría (Si ya tenemos leadId)
        if (leadId) {
             const categories = await getCategories().catch(() => []) as Array<{ id: string | number, name: string, price_list_url?: string }>;
             const matchedCat = categories.find((c) => 
                 text.toLowerCase().includes(c.name.toLowerCase())
             );

             if (matchedCat) {
                 console.log(`[api/chat] FLOW: Match con categoría ${matchedCat.name}`);
                 const { services } = await getServicesByCategory(String(matchedCat.id)).catch(() => ({ services: [] }));
                 const assistantMsg = `¡Excelente elección! En **${matchedCat.name}** tenemos estos servicios. ¿Cuál te gustaría realizarte?\n\n` + 
                                    services.map((s: { title: string; price: number | string | null }) => `• ${s.title}: $${s.price}`).join('\n');
                 
                 res.setHeader('Content-Type', 'text/event-stream');
                 res.write(`data: ${JSON.stringify({ leadId })}\n\n`);
                 if (matchedCat.price_list_url) res.write(`data: ${JSON.stringify({ media_url: matchedCat.price_list_url })}\n\n`);
                 res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: assistantMsg } }] })}\n\n`);
                 res.write('data: [DONE]\n\n');
                 return res.end();
             }
        }

        // --- 2. INTELIGENCIA ARTIFICIAL (OpenRouter) ---
        console.log('[api/chat] AI: Delegando a OpenRouter...');

        const systemPrompt = `Eres la asistente virtual experta de Kâlon Estética. 
Tu objetivo es ser amable, boutique y profesional. ✨
Ya te presentaste y el cliente ya vio el catálogo.
Responde de forma concisa y ayuda al cliente con sus dudas sobre tratamientos.`;

        const stream = await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash-001',
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.map((m) => ({ role: m.role as "system" | "user" | "assistant", content: m.content }))
            ],
            stream: true,
        });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        res.write(`data: ${JSON.stringify({ leadId: leadId || 'temp' })}\n\n`);

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
            }
        }

        res.write('data: [DONE]\n\n');
        return res.end();

    } catch (e: unknown) {
        const error = e as Error;
        console.error('[api/chat] CRITICAL ERROR:', error.message);
        if (!res.headersSent) {
            return res.status(500).json({ error: error.message });
        }
        res.end();
    }
}
