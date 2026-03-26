import { VercelRequest, VercelResponse } from '@vercel/node';
import { streamText, convertToCoreMessages } from 'ai';
import { getKalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { findLeadByInitId } from './_services/db.js';
import { generateMenuImage } from './_services/imageGenerator.js';

/**
 * HANDLER DE CHAT KÂLON - VERSIÓN BLINDADA (STREAMING ORQUESTADO)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. Configuración de Headers SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { messages = [], identificationId, clientPhone } = req.body;
    const initId = identificationId || "guest";
    
    res.write(`data: ${JSON.stringify({ stage: 'identifying' })}\n\n`);

    try {
        // 2. Identificar Cliente (Lead Persistence)
        let leadId: string | null = null;
        if (initId && initId.length > 5) {
            const lead = await findLeadByInitId(initId).catch(() => null);
            leadId = lead?.id || null;
        }

        // 3. Inicializar Modelos y Herramientas
        const model = getKalonModel();
        const coreMessages = convertToCoreMessages(messages);
        
        // 4. Iniciar Stream con Orquestación Automática (MaxSteps 5 para Tool Loops)
        const result = streamText({
            model,
            system: getSystemPrompt(leadId, coreMessages.length),
            messages: coreMessages,
            tools: buildTools(leadId, null, initId),
            maxSteps: 5,
        });

        // 5. Handshake Inicial (Stage: Pensando)
        res.write(`data: ${JSON.stringify({ stage: 'thinking' })}\n\n`);

        let fullAssistantContent = "";

        // 6. Procesar Partes del Stream (Texto y Herramientas)
        for await (const chunk of result.fullStream) {
            // A. Texto Delta
            if (chunk.type === 'text-delta') {
                const text = chunk.textDelta;
                fullAssistantContent += text;
                res.write(`data: ${JSON.stringify({ 
                    choices: [{ delta: { content: text } }],
                    stage: 'chatting'
                })}\n\n`);
            }

            // B. Resultados de Herramientas (Para inyectar imágenes Satori)
            if (chunk.type === 'tool-result') {
                const { toolName, result } = chunk;
                console.log(`[Tool Result] ${toolName}: completed.`);

                // Si la herramienta retornó categorías o servicios, disparamos Satori
                if (toolName === 'listar_categorias_principales' || toolName === 'consultar_servicios') {
                    if (result && result.length > 0) {
                        res.write(`data: ${JSON.stringify({ stage: 'generating_ui' })}\n\n`);
                        
                        const title = toolName === 'listar_categorias_principales' ? 'NUESTRAS ESPECIALIDADES' : 'SERVICIOS DISPONIBLES';
                        const items = result.map((r: any) => ({ 
                            label: r.name || r.client_name, 
                            price: r.price || r.total_price 
                        }));
                        
                        const buf = await generateMenuImage(title, items).catch(() => null);
                        if (buf) {
                            const base64 = `data:image/png;base64,${buf.toString('base64')}`;
                            res.write(`data: ${JSON.stringify({ media_url: base64 })}\n\n`);
                        }
                    }
                }
            }

            // C. Finish (Metadata final)
            if (chunk.type === 'finish') {
                console.log(`[Chat Finish] Response Length: ${fullAssistantContent.length}`);
            }
        }

        // 7. Señal de Fin de Stream
        res.write(`data: [DONE]\n\n`);
        return res.end();

    } catch (error: any) {
        console.error("[Chat API Error]:", error);
        res.write(`data: ${JSON.stringify({ error: "Lo siento, tuve un pequeño contratiempo. ¿Podés repetir eso?" })}\n\n`);
        res.end();
    }
}
