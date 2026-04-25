import OpenAI from 'openai';
import { createLead, sql, getCategories, getServicesByCategory, findLeadByInitId } from './_services/db.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  maxDuration: 60,
};

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || 'sk-or-dummy',
});

/**
 * CHATBOT HÍBRIDO KÂLON (v2.5) - REFACTORIZADO PARA ROBUSTEZ TOTAL
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { messages = [], leadId, identificationId, message } = req.body as { 
            messages: Array<{ role: string; content: string }>;
            leadId?: string | number;
            identificationId?: string;
            message?: string;
        };
        
        const lastMessage = messages[messages.length - 1];
        const text = (message || lastMessage?.content || '').trim();
        const isGreeting = text.toLowerCase().length < 6 && (text.toLowerCase().includes('hola') || text.toLowerCase().includes('buen'));

        console.log(`[api/chat] MSG: "${text}" | ID: ${identificationId} | LeadId: ${leadId}`);

        // --- 1. PRE-PROCESAMIENTO: IDENTIFICACIÓN ROBUSTA ---
        let activeLeadId: string | number | null = leadId || null;
        if (identificationId && String(identificationId).length > 10 && !activeLeadId) {
            const existingLead = await findLeadByInitId(String(identificationId)).catch(() => null);
            if (existingLead) {
                activeLeadId = existingLead.id;
                console.log(`[api/chat] Lead recuperado por initId: ${activeLeadId}`);
            }
        }

        // --- 2. CLASIFICACIÓN DE INTENCIÓN (IA) ---
        const categories = await getCategories().catch(() => []) as Array<{ id: string | number, name: string, price_list_url?: string }>;
        const catList = categories.map(c => `${c.id}: ${c.name}`).join(', ');

        const classificationPrompt = `Analiza el mensaje del usuario para KÂLON Estética.
        Categorías disponibles: [${catList}]
        Estado actual del Lead: ${activeLeadId ? 'Identificado' : 'No Identificado'}
        
        Responde ÚNICAMENTE un objeto JSON con:
        {
          "intent": "SALUDO" | "REGISTRO" | "CONSULTA_SERVICIO" | "TURNO" | "OTRO",
          "detected_categories": [ids_de_categorias_detectadas],
          "detected_name": "nombre si es registro",
          "is_negation": true/false
        }
        
        Mensaje: "${text}"`;

        const classificationResponse = await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash-001',
            messages: [{ role: 'system', content: classificationPrompt }],
            response_format: { type: 'json_object' }
        }).catch(() => null);

        const classification = JSON.parse(classificationResponse?.choices[0]?.message?.content || '{}');
        const { intent, detected_categories = [], detected_name, is_negation } = classification;

        console.log(`[api/chat] INTENT: ${intent} | Cats: ${detected_categories} | Name: ${detected_name}`);

        // --- 3. EJECUCIÓN DE ETAPAS ---

        // A) SALUDO (Etapa 0)
        if (intent === 'SALUDO' && !activeLeadId) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "¡Hola! Bienvenida/o a KÂLON Estética ✨. Soy tu asistente virtual. Para empezar, ¿me decís tu nombre y apellido? 😊" } }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // B) CONSULTA DE SERVICIO (Etapa 2 y 3)
        let assistantContext = "";
        if (intent === 'CONSULTA_SERVICIO' && !is_negation && detected_categories.length > 0) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Accel-Buffering', 'no');

            if (activeLeadId) res.write(`data: ${JSON.stringify({ leadId: activeLeadId })}\n\n`);

            const matchedCats = categories.filter(c => detected_categories.includes(c.id) || detected_categories.includes(String(c.id)));
            for (const cat of matchedCats) {
                if (cat.price_list_url) res.write(`data: ${JSON.stringify({ media_url: cat.price_list_url })}\n\n`);
            }

            const catNames = matchedCats.map(c => `**${c.name}**`).join(' y ');
            assistantContext = `El usuario solicitó información sobre: ${catNames}. Ya le enviamos las imágenes de los precios correspondientes.`;
            // NO cortamos el flujo aquí (eliminado return), dejamos que la IA dé el toque final humano (Etapa 3)
        }

        // C) REGISTRO (Etapa 1)
        if (!activeLeadId && intent === 'REGISTRO' && detected_name && detected_categories.length === 0) {
            console.log('[api/chat] FLOW: Registrando nuevo lead...');
            const configRows = await sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []);
            const mainImageUrl = configRows?.[0]?.value || 'https://ijltsqfshvunmngvbeue.supabase.co/storage/v1/object/public/kalon-services/CATALOGO%20KALON.png';

            const newLead = await createLead(null, detected_name, { 
                phone: `anon_${Date.now()}`, 
                source: "chatbot_web", 
                initId: String(identificationId || '') 
            }).catch(() => null);
            
            const finalLeadId = newLead?.id || `temp_${Date.now()}`;
            res.setHeader('Content-Type', 'text/event-stream');
            res.write(`data: ${JSON.stringify({ leadId: finalLeadId })}\n\n`);
            res.write(`data: ${JSON.stringify({ media_url: mainImageUrl })}\n\n`);
            
            // Aquí sí podemos terminar porque el registro es un flujo cerrado de bienvenida
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `¡Un gusto conocerte, ${detected_name}! ✨ Te dejo nuestro catálogo arriba para que lo veas. Contame, ¿qué servicio o tratamiento te interesa hoy?` } }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // D) IA (Etapa 3 / Fallback)
        console.log('[api/chat] ETAPA 3 / IA FALLBACK');
        const stream = await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash-001',
            messages: [
                { 
                    role: 'system', 
                    content: `Eres la asistente de Kâlon Estética. 
                    Cliente: ${activeLeadId ? 'Identificado' : 'No identificado'}. 
                    Contexto Actual: ${assistantContext || 'Conversación general'}.
                    Si el contexto indica que ya enviamos imágenes, confirma que viste su pedido específico y pregunta si quiere agendar o tiene dudas. 
                    Sé muy amable y profesional.` 
                },
                ...messages.map((m) => ({ role: m.role as any, content: m.content }))
            ],
            stream: true,
        });

        if (!res.headersSent) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Accel-Buffering', 'no');
        }
        
        if (activeLeadId) res.write(`data: ${JSON.stringify({ leadId: activeLeadId })}\n\n`);

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        return res.end();

    } catch (e: any) {
        console.error('[api/chat] ERROR:', e.message);
        if (!res.headersSent) {
            res.status(500).json({ error: e.message });
        } else {
            res.end();
        }
    }
}
