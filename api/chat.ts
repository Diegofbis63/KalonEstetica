import OpenAI from 'openai';
import { createLead, sql, getCategories, getServicesByCategory, findLeadByInitId } from './_services/db.js';
import type { VercelRequest, VercelResponse } from '@vercel node';

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

        // --- 2. LÓGICA DETERMINÍSTICA (ETAPAS) ---

        // A) SALUDO INICIAL (Etapa 0)
        if (isGreeting && !activeLeadId) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "¡Hola! Bienvenida/o a KÂLON Estética ✨. Soy tu asistente virtual. Para empezar, ¿me decís tu nombre y apellido? 😊" } }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // B) DETECCIÓN DE CATEGORÍAS (Prioridad: Etapa 2)
        // Buscamos siempre categorías para evitar que el bot pida el nombre si el usuario ya pidió un servicio
        const categories = await getCategories().catch(() => []) as Array<{ id: string | number, name: string, price_list_url?: string }>;
        const normalizedText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        const matchedCats = categories.filter((c) => {
            const catName = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return normalizedText.includes(catName) || 
                   catName.includes(normalizedText) || 
                   (catName.length > 4 && normalizedText.includes(catName.substring(0, catName.length - 1)));
        });

        if (matchedCats.length > 0) {
            console.log(`[api/chat] MATCH CATEGORÍA: [${matchedCats.map(c => c.name).join(', ')}]`);
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Accel-Buffering', 'no');

            if (activeLeadId) res.write(`data: ${JSON.stringify({ leadId: activeLeadId })}\n\n`);

            let fullAssistantMsg = `¡Claro! Acá tenés la info de lo que me pediste:\n\n`;
            for (const cat of matchedCats) {
                if (cat.price_list_url) {
                    res.write(`data: ${JSON.stringify({ media_url: cat.price_list_url })}\n\n`);
                }
                const { services } = await getServicesByCategory(String(cat.id)).catch(() => ({ services: [] }));
                if (services.length > 0) {
                    fullAssistantMsg += `✨ **${cat.name}**:\n` + 
                                      services.map((s: { title: string; price: number | string | null }) => `• ${s.title}: $${s.price}`).join('\n') + '\n\n';
                }
            }
            fullAssistantMsg += `¿Te gustaría agendar un turno para alguno de estos servicios?`;
            
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: fullAssistantMsg } }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // C) REGISTRO DE USUARIO (Etapa 1)
        if (!activeLeadId && !isGreeting && text.length >= 2) {
            console.log('[api/chat] IDENTIFICANDO NUEVO LEAD...');
            const tempPhone = `anon_${Date.now()}`;
            const newLead = await createLead(null, text, { 
                phone: tempPhone, 
                source: "chatbot_web", 
                initId: String(identificationId || '') 
            }).catch(() => null);
            
            const finalLeadId = newLead?.id || `temp_${Date.now()}`;
            const mainImageUrl = "https://ijltsqfshvunmngvbeue.supabase.co/storage/v1/object/public/kalon-services/CATALOGO%20KALON.png";
            const assistantMsg = `¡Un gusto conocerte, **${text}**! ✨\n\nTe dejo arriba nuestro **Catálogo Maestro** con todas nuestras especialidades.\n\n¿En qué tratamiento estás interesada/o hoy? Decime el nombre y te paso los precios y detalles.`;

            res.setHeader('Content-Type', 'text/event-stream');
            res.write(`data: ${JSON.stringify({ leadId: finalLeadId })}\n\n`);
            res.write(`data: ${JSON.stringify({ media_url: mainImageUrl })}\n\n`);
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: assistantMsg } }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // --- 3. INTELIGENCIA ARTIFICIAL (Fallback) ---
        console.log('[api/chat] AI FALLBACK: Gemini 2.0 Flash');
        const systemPrompt = `Eres la asistente virtual experta de Kâlon Estética. Amable y profesional. Ayuda al cliente con sus dudas sobre servicios.`;

        const stream = await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash-001',
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.map((m) => ({ role: m.role as any, content: m.content }))
            ],
            stream: true,
        });

        res.setHeader('Content-Type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({ leadId: activeLeadId || 'temp' })}\n\n`);

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
            }
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
