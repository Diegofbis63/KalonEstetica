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
        const categories = await getCategories().catch(() => []) as Array<{ id: string | number, name: string, price_list_url?: string }>;
        const normalizedText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        // Encontramos las categorías y guardamos su posición en el texto para respetar el orden del usuario
        const matchedWithPos = categories.map(c => {
            const catName = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const pos = normalizedText.indexOf(catName);
            return { cat: c, pos };
        }).filter(item => item.pos !== -1).sort((a, b) => a.pos - b.pos);

        if (matchedWithPos.length > 0) {
            const matchedCats = matchedWithPos.map(item => item.cat);
            console.log(`[api/chat] MATCH CATEGORÍA (Ordenado): [${matchedCats.map(c => c.name).join(', ')}]`);
            
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Accel-Buffering', 'no');

            if (activeLeadId) res.write(`data: ${JSON.stringify({ leadId: activeLeadId })}\n\n`);

            // Enviamos las imágenes de las categorías en el orden solicitado
            for (const cat of matchedCats) {
                if (cat.price_list_url) {
                    res.write(`data: ${JSON.stringify({ media_url: cat.price_list_url })}\n\n`);
                }
            }

            // Mensaje de texto simplificado (sin lista de precios, ya está en la imagen)
            const catNames = matchedCats.map(c => `**${c.name}**`).join(' y ');
            const assistantMsg = `¡Claro! Acá tenés la info de ${catNames} que me pediste. ✨\n\n¿Te gustaría agendar un turno para alguno de estos servicios?`;
            
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: assistantMsg } }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // C) REGISTRO DE USUARIO (Etapa 1)
        if (!activeLeadId && !isGreeting && text.length >= 2) {
            console.log('[api/chat] FLOW: Registrando nuevo lead...');
            
            // Recuperamos la imagen del catálogo desde la configuración del negocio
            const configRows = await sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []);
            const mainImageUrl = configRows?.[0]?.value || 'https://ijltsqfshvunmngvbeue.supabase.co/storage/v1/object/public/kalon-services/CATALOGO%20KALON.png';

            const tempPhone = `anon_${Date.now()}`;
            const newLead = await createLead(null, text, { 
                phone: tempPhone, 
                source: "chatbot_web", 
                initId: String(identificationId || '') 
            }).catch(() => null);
            
            const finalLeadId = newLead?.id || `temp_${Date.now()}`;
            const assistantMsg = `¡Un gusto conocerte, ${text}! ✨ Te dejo nuestro catálogo arriba. Contame, ¿qué servicio o tratamiento te interesa hoy?`;

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
