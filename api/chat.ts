import { streamText, convertToCoreMessages } from 'ai';
import { getKalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { findLeadByFlexiblePhone, insertChatLog, findLeadByInitId } from './_services/db.js';
import { generateMenuImage } from './_services/imageGenerator.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS - Ampliado para evitar bloqueos
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PATCH,DELETE,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // SSE Headers
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

        // 1. Identificación de Lead
        if (idToIdentify && typeof idToIdentify === 'string') {
            const digitsOnly = idToIdentify.replace(/\D/g, '');
            if (digitsOnly.length >= 8 && !idToIdentify.includes('-')) {
                const lead = await findLeadByFlexiblePhone(digitsOnly).catch(() => null);
                leadId = lead?.id || null;
            } 
            
            // Si el mensaje es una intro ("Soy Juan"), ignoramos leadId previo para permitir registro fresco
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

        // 2. Preparar Mensajes (Clave para Gemini)
        const rawHistory = Array.isArray(messages) ? messages : [];
        // Filtramos mensajes vacíos o corruptos
        const cleanHistory = rawHistory.filter((m: any) => m.content && m.role);
        
        // Evitamos duplicar el mensaje actual si ya está en el historial
        const lastInHistory = cleanHistory.length > 0 ? cleanHistory[cleanHistory.length - 1] : null;
        const preparedMessages = [...cleanHistory];
        
        if (incomingMessage && (!lastInHistory || lastInHistory.content !== incomingMessage)) {
            preparedMessages.push({ role: 'user', content: incomingMessage });
        }

        // Si no hay mensajes, forzamos un inicio
        if (preparedMessages.length === 0) {
            preparedMessages.push({ role: 'user', content: 'Hola' });
        }

        // CONVERSION CRÍTICA: SDK Gemini requiere model en vez de assistant
        const coreMessages = convertToCoreMessages(preparedMessages.slice(-10));
        
        console.log(`[Chat] Starting Stream. Lead: ${leadId}, Msgs: ${coreMessages.length}, Last: "${incomingMessage}"`);

        // 3. Handshake SSE
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "" } }], stage: 'chatting' })}\n\n`);

        const result = streamText({
            model,
            system: getSystemPrompt(leadId),
            messages: coreMessages,
            tools: buildTools(leadId, DEFAULT_ORG_ID, initId),
            maxSteps: 5,
            onStepFinish: async (step) => {
                console.log(`[Step] ${step.stepType} finished. Tools called: ${step.toolCalls.length}`);
                
                // Actualizar leadId si se registró en este paso
                const foundReg = step.toolResults.find(r => r.toolName === 'registrar_cliente')?.result as any;
                if (foundReg?.id) {
                    leadId = foundReg.id;
                    console.log(`[Identification] Lead caught in step: ${leadId}`);
                }

                // Procesar imágenes Satori
                for (const call of step.toolCalls) {
                    if (call.toolName === 'listar_categorias_principales' || call.toolName === 'consultar_servicios') {
                        const toolRes = step.toolResults.find(r => r.toolCallId === call.toolCallId)?.result;
                        if (Array.isArray(toolRes)) {
                            try {
                                if (call.toolName === 'listar_categorias_principales') {
                                    const items = toolRes.map((c: any) => ({ label: c.nombre }));
                                    const buf = await generateMenuImage('NUESTRAS ESPECIALIDADES', items).catch(() => null);
                                    if (buf && !res.writableEnded) {
                                        const base64 = `data:image/png;base64,${buf.toString('base64')}`;
                                        res.write(`data: ${JSON.stringify({ media_url: base64, stage: 'satori_generated' })}\n\n`);
                                    }
                                } else {
                                    for (const cat of toolRes) {
                                        const items = (cat.servicios || []).map((s: any) => ({ label: s.titulo, price: s.precio }));
                                        const buf = await generateMenuImage(cat.categoria, items).catch(() => null);
                                        if (buf && !res.writableEnded) {
                                            const base64 = `data:image/png;base64,${buf.toString('base64')}`;
                                            res.write(`data: ${JSON.stringify({ media_url: base64, stage: 'satori_generated' })}\n\n`);
                                        }
                                    }
                                }
                            } catch (satoriErr) {
                                console.error("[Satori Error]:", satoriErr);
                            }
                        }
                    }
                }
            }
        });

        // 4. Consumo del Stream de Texto
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
        } catch (streamErr) {
            console.error("[Stream Text Error]:", streamErr);
            // Si falla el stream de texto, intentamos enviar lo que llevamos o un error
            if (fullAssistantContent.length === 0 && !res.writableEnded) {
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Ups, se me cortó la señal. ¿Me repetís?" } }], stage: 'error' })}\n\n`);
            }
        }

        // 5. Finalización y Logs
        if (leadId && fullAssistantContent.trim()) {
            await insertChatLog(leadId, 'assistant', fullAssistantContent, null, false).catch(e => {
                console.log("[DB Log Error]:", e);
            });
        }

        if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
            res.end();
        }

    } catch (err: any) {
        console.error("[Fatal Handler Error]:", err);
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ 
                choices: [{ delta: { content: "Perdón, tuve un problema técnico. ¿Me decís tu nombre de nuevo?" } }], 
                stage: 'error' 
            })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        }
    }
}
