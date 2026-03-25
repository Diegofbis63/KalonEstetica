import { streamText, convertToCoreMessages } from 'ai';
import { getKalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { findLeadByFlexiblePhone, insertChatLog, findLeadByInitId } from './_services/db.js';
import { generateMenuImage } from './_services/imageGenerator.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS - Ampliado para evitar bloqueos en preflight de navegadores
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PATCH,DELETE,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // SSE Headers para Streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');

    const DEFAULT_ORG_ID = 'kalon-estetica';

    try {
        const { message, messages, userId: userIdRaw, clientPhone, identificationId: initId } = req.body || {};
        const incomingMessage = (message || "").trim();
        const idToIdentify = initId || userIdRaw || (typeof clientPhone === 'string' && clientPhone.length > 5 ? clientPhone : null);
        
        let leadId = null;

        // 1. Identificación robusta para recuperar historial o evitar registros duplicados
        if (idToIdentify && typeof idToIdentify === 'string') {
            const digitsOnly = idToIdentify.replace(/\D/g, '');
            if (digitsOnly.length >= 8 && !idToIdentify.includes('-')) {
                const lead = await findLeadByFlexiblePhone(digitsOnly).catch(() => null);
                leadId = lead?.id || null;
            } 
            
            // Si el cliente envía su nombre explícito (intro), ignoramos el ID de sesión previo
            const looksLikeIntro = incomingMessage.length < 50 && (
                incomingMessage.toLowerCase().includes('soy') || 
                incomingMessage.toLowerCase().includes('nombre') || 
                incomingMessage.toLowerCase().includes('llamo') || 
                incomingMessage.split(' ').length <= 4
            );
            
            if (!leadId && !looksLikeIntro && (idToIdentify.includes('-') || idToIdentify.length > 20)) {
                const lead = await findLeadByInitId(idToIdentify).catch(() => null);
                leadId = lead?.id || null;
            }
        }

        const model = getKalonModel();

        // 2. Limpieza y preparación de historial para Gemini
        const rawHistory = Array.isArray(messages) ? messages : [];
        const cleanHistory = rawHistory.filter((m: any) => m.content && m.role);
        
        const lastInHistory = cleanHistory.length > 0 ? cleanHistory[cleanHistory.length - 1] : null;
        const preparedMessages = [...cleanHistory];
        
        if (incomingMessage && (!lastInHistory || lastInHistory.content !== incomingMessage)) {
            preparedMessages.push({ role: 'user', content: incomingMessage });
        }

        if (preparedMessages.length === 0) {
            preparedMessages.push({ role: 'user', content: 'Hola' });
        }

        // CONVERSION OBLIGATORIA: De 'assistant' a 'model' para el SDK de Google
        const coreMessages = convertToCoreMessages(preparedMessages.slice(-10));
        
        console.log(`[Chat Request] Lead: ${leadId || 'N/A'}, Messages: ${coreMessages.length}, Prompting voseo.`);

        // 3. Handshake inicial (SSE KEEP-ALIVE)
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "" } }], stage: 'chatting' })}\n\n`);
        }

        const result = streamText({
            model,
            system: getSystemPrompt(leadId, coreMessages.length),
            messages: coreMessages,
            tools: buildTools(leadId, DEFAULT_ORG_ID, initId),
            maxSteps: 5,
            onStepFinish: async (step) => {
                console.log(`[AI Step] Type: ${step.stepType}, ToolCalls: ${step.toolCalls.length}`);
                
                // Actualizar leadId en tiempo real para persistencia si se ejecuta registrar_cliente
                const regRes = step.toolResults.find(r => r.toolName === 'registrar_cliente')?.result as any;
                if (regRes?.id) {
                    leadId = regRes.id;
                    console.log(`[Bunker System] Client identified: ${leadId}`);
                }

                // Generación de Menús Visuales Satori
                for (const call of step.toolCalls) {
                    try {
                        const rawToolRes = step.toolResults.find(r => r.toolCallId === call.toolCallId)?.result;
                        if (Array.isArray(rawToolRes)) {
                            if (call.toolName === 'listar_categorias_principales') {
                                const items = rawToolRes.map((c: any) => ({ label: c.nombre }));
                                const buf = await generateMenuImage('NUESTRAS ESPECIALIDADES', items).catch(() => null);
                                if (buf && !res.writableEnded) {
                                    const base64 = `data:image/png;base64,${buf.toString('base64')}`;
                                    res.write(`data: ${JSON.stringify({ media_url: base64, stage: 'satori_generated' })}\n\n`);
                                }
                            } else if (call.toolName === 'consultar_servicios') {
                                for (const cat of (rawToolRes as any)) {
                                    const items = (cat.servicios || []).map((s: any) => ({ label: s.titulo, price: s.precio }));
                                    const buf = await generateMenuImage(cat.categoria, items).catch(() => null);
                                    if (buf && !res.writableEnded) {
                                        const base64 = `data:image/png;base64,${buf.toString('base64')}`;
                                        res.write(`data: ${JSON.stringify({ media_url: base64, stage: 'satori_generated' })}\n\n`);
                                    }
                                }
                            }
                        }
                    } catch (satoriErr) {
                        console.error("[Satori Image Error]:", satoriErr);
                    }
                }
            }
        });

        // 4. Procesamiento secuencial del stream de texto
        let fullAssistantContent = "";
        try {
            for await (const chunk of result.textStream) {
                fullAssistantContent += chunk;
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ 
                        choices: [{ delta: { content: chunk } }], 
                        stage: 'chatting' 
                    })}\n\n`);
                }
            }
        } catch (iterError) {
            console.error("[Stream Text Iteration Fail]:", iterError);
        }

        // 5. Finalización y guardado de logs en BD
        if (leadId && fullAssistantContent.trim()) {
            await insertChatLog(leadId, 'assistant', fullAssistantContent, null, false).catch(e => {
                console.error("[DB Final Log Error]:", e);
            });
        }

        if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
            res.end();
        }

    } catch (err: any) {
        console.error("[Bunker Critical Failure]:", err);
        const recoveryMsg = "Perdón por la demora, estoy con mucha demanda. ¿Me podrías decir tu nombre completo de nuevo? 😊";
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ 
                choices: [{ delta: { content: recoveryMsg } }], 
                stage: 'error' 
            })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        }
    }
}
