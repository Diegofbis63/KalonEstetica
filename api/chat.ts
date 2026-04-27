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
        let leadByInitId = null;
        let activeLeadId: string | number | null = leadId || null;
        if (identificationId && String(identificationId).length > 10 && !activeLeadId) {
            leadByInitId = await findLeadByInitId(String(identificationId)).catch(() => null);
            if (leadByInitId) {
                activeLeadId = leadByInitId.id;
                console.log(`[api/chat] Lead recuperado por initId: ${activeLeadId} (${leadByInitId.first_name})`);
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

        // B) CONSULTA DE SERVICIO (Etapa 2 y 3) - DINÁMICO
        let assistantContext = "";
        let receiptUrl = "";
        
        if (intent === 'CONSULTA_SERVICIO' && !is_negation && detected_categories.length > 0) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Accel-Buffering', 'no');

            if (activeLeadId) res.write(`data: ${JSON.stringify({ leadId: activeLeadId })}\n\n`);

            // 1. Buscar servicios específicos (Ignorando números al inicio como "1. ", "2. ")
            const allServices = await sql`SELECT id, name, price, category_id FROM services WHERE active = true`.catch(() => []);
            const matchedServices = allServices.filter((s: any) => {
                // Limpiar el nombre del servicio de números y puntos al inicio (ej: "2. Laminado" -> "laminado")
                const cleanServiceName = s.name.replace(/^\d+[\s.]*/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                const userTextNorm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                
                // Buscamos si el texto del usuario contiene el nombre del servicio o palabras clave significativas
                const words = cleanServiceName.split(' ').filter(w => w.length > 3);
                return detected_categories.includes(s.category_id) && 
                       (userTextNorm.includes(cleanServiceName) || words.some(w => userTextNorm.includes(w)));
            });

            if (matchedServices.length > 0) {
                // GENERAR RECIBO DINÁMICO (Satori)
                const receiptItems = matchedServices.map((s: any) => ({ 
                    name: s.name.replace(/^\d+[\s.]*/, ''), 
                    price: `$${Number(s.price).toLocaleString('es-AR')}` 
                }));
                const totalPrice = matchedServices.reduce((acc: number, s: any) => acc + Number(s.price), 0);
                receiptItems.push({ name: 'TOTAL ESTIMADO', price: `$${totalPrice.toLocaleString('es-AR')}` });
                
                const satoriData = Buffer.from(JSON.stringify(receiptItems)).toString('base64');
                const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://kalon-estetica.vercel.app';
                receiptUrl = `${baseUrl}/api/satori-image?title=${encodeURIComponent('TU PRESUPUESTO KÂLON')}&data=${satoriData}`;
                
                res.write(`data: ${JSON.stringify({ media_url: receiptUrl })}\n\n`);
                // Inyectamos los precios REALES en el contexto para que la IA no alucine
                assistantContext = `RECIBO ENVIADO. Servicios: ${matchedServices.map((s: any) => `${s.name}: $${s.price}`).join(', ')}. TOTAL REAL: $${totalPrice.toLocaleString('es-AR')}.`;
            } else {
                // Fallback a imágenes de categoría si no hay servicios específicos detectados
                const matchedCats = categories.filter(c => detected_categories.includes(c.id) || detected_categories.includes(String(c.id)));
                for (const cat of matchedCats) {
                    if (cat.price_list_url) res.write(`data: ${JSON.stringify({ media_url: cat.price_list_url })}\n\n`);
                }
                const catNames = matchedCats.map(c => `**${c.name}**`).join(' y ');
                assistantContext = `El usuario solicitó información sobre: ${catNames}. Ya le enviamos las imágenes de los precios correspondientes.`;
            }
        }

        // C) REGISTRO (Etapa 1) - PRIORIDAD ABSOLUTA
        // Si no tenemos leadId y la IA detectó un nombre, registramos sí o sea.
        if (!activeLeadId && (intent === 'REGISTRO' || detected_name) && detected_categories.length === 0) {
            console.log('[api/chat] FLOW: Registrando nuevo lead (Etapa 1)...');
            const configRows = await sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []);
            const mainImageUrl = configRows?.[0]?.value || 'https://ijltsqfshvunmngvbeue.supabase.co/storage/v1/object/public/kalon-services/CATALOGO%20KALON.png';

            const newLead = await createLead(null, detected_name!, { 
                phone: `anon_${Date.now()}`, 
                source: "chatbot_web", 
                initId: String(identificationId || '') 
            }).catch(() => null);
            
            const finalLeadId = newLead?.id || `temp_${Date.now()}`;
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Accel-Buffering', 'no');
            
            res.write(`data: ${JSON.stringify({ leadId: finalLeadId })}\n\n`);
            res.write(`data: ${JSON.stringify({ media_url: mainImageUrl })}\n\n`);
            
            const welcomeMsg = `¡Un gusto conocerte, ${detected_name}! ✨ Te dejo nuestro catálogo arriba para que lo veas. Contame, ¿qué servicio o tratamiento te interesa hoy?`;
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: welcomeMsg } }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // D) IA (Etapa 3 / Fallback)
        // Solo llegamos aquí si el usuario ya está registrado o si no es un registro puro
        console.log('[api/chat] ETAPA 3 / IA CONVERSACIONAL');
        
        // Obtenemos el nombre real del lead para evitar confusiones de identidad
        const currentLeadName = leadByInitId?.first_name || detected_name || 'cliente';

        const stream = await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash-001',
            messages: [
                { 
                    role: 'system', 
                    content: `Eres la asistente experta de Kâlon Estética. 
                    Tu nombre es Asistente Kâlon.
                    Usuario actual: ${currentLeadName}.
                    Estado: ${assistantContext ? 'Precios enviados' : 'Consulta general'}.
                    
                    REGLAS DE ORO (ETAPA 3 - CIERRE):
                    1. Si enviamos un RECIBO (mencionado en el contexto como "RECIBO ENVIADO"), confirma que preparaste el presupuesto.
                    2. MENCIONA EL TOTAL REAL: Usa el monto que aparece en "TOTAL REAL: $..." del contexto. NO INVENTES PRECIOS.
                    3. Si vas a listar los servicios en el texto, usa EXACTAMENTE los precios que figuran en el contexto (ej: "Axilas: $3.500").
                    4. Sé breve, profesional y usa siempre el nombre ${currentLeadName}.
                    5. Pregunta directamente si quiere agendar un turno.` 
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
