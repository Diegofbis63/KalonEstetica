import { streamText, convertToCoreMessages } from 'ai';
import { getKalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { findLeadByFlexiblePhone, insertChatLog, findLeadByInitId } from './_services/db.js';
import { generateMenuImage } from './_services/imageGenerator.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // SSE Response Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');

    const DEFAULT_ORG_ID = 'kalon-estetica';

    try {
        const { message, messages, userId: userIdRaw, clientPhone, identificationId: initId } = req.body || {};
        const incomingMessage = message || "";
        const idToIdentify = initId || userIdRaw || (typeof clientPhone === 'string' && clientPhone.length > 5 ? clientPhone : null);
        
        let leadId = null;

        // Búsqueda de lead previo para contexto
        if (idToIdentify && typeof idToIdentify === 'string') {
            const digitsOnly = idToIdentify.replace(/\D/g, '');
            if (digitsOnly.length >= 8 && !idToIdentify.includes('-')) {
                const lead = await findLeadByFlexiblePhone(digitsOnly).catch(() => null);
                leadId = lead?.id || null;
            } 
            
            // Si el mensaje actual es una presentación ("Soy Felipe"), ignoramos el ID de sesión previo para permitir registro nuevo
            const looksLikeIntro = incomingMessage && incomingMessage.length < 50 && (
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

        // Limpiamos mensajes y convertimos a formato Core (Gemini requiere model en vez de assistant)
        const rawHistory = Array.isArray(messages) ? messages : [];
        const lastInHistory = rawHistory.length > 0 ? rawHistory[rawHistory.length - 1] : null;
        
        const preparedMessages = [...rawHistory];
        if (incomingMessage && (!lastInHistory || lastInHistory.content !== incomingMessage)) {
            preparedMessages.push({ role: 'user', content: incomingMessage });
        }
        
        const coreMessages = convertToCoreMessages(preparedMessages.slice(-10));
        console.log(`[Chat] Requesting AI with ${coreMessages.length} messages. LeadId: ${leadId}`);

        // Handshake inicial
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "" } }], stage: 'chatting' })}\n\n`);
        }

        const result = streamText({
            model,
            system: getSystemPrompt(leadId),
            messages: coreMessages,
            tools: buildTools(leadId, DEFAULT_ORG_ID, initId),
            maxSteps: 5,
            onStepFinish: async (step) => {
                // Captura dinámica del ID de lead si se registra en este paso
                const regRes = step.toolResults.find(r => r.toolName === 'registrar_cliente')?.result as any;
                if (regRes?.id) leadId = regRes.id;

                // Inyección de imágenes Satori
                for (const call of step.toolCalls) {
                    try {
                        if (call.toolName === 'listar_categorias_principales') {
                            const resTool = step.toolResults.find(r => r.toolCallId === call.toolCallId)?.result;
                            if (Array.isArray(resTool)) {
                                const items = resTool.map((c: any) => ({ label: c.nombre }));
                                const imageBuffer = await generateMenuImage('NUESTRAS ESPECIALIDADES', items).catch(() => null);
                                if (imageBuffer && !res.writableEnded) {
                                    const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                                    res.write(`data: ${JSON.stringify({ media_url: base64, stage: 'satori_generated' })}\n\n`);
                                }
                            }
                        }
                        if (call.toolName === 'consultar_servicios') {
                            const foundCategories = step.toolResults.find(r => r.toolCallId === call.toolCallId)?.result;
                            if (Array.isArray(foundCategories)) {
                                for (const cat of foundCategories) {
                                    const items = (cat.servicios || []).map((s: any) => ({ label: s.titulo, price: s.precio }));
                                    const imageBuffer = await generateMenuImage(cat.categoria, items).catch(() => null);
                                    if (imageBuffer && !res.writableEnded) {
                                        const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                                        res.write(`data: ${JSON.stringify({ media_url: base64, stage: 'satori_generated' })}\n\n`);
                                    }
                                }
                            }
                        }
                    } catch (e) { console.error("[onStepFinish Error]:", e); }
                }
            }
        });

        let fullContent = "";
        for await (const textDelta of result.textStream) {
            fullContent += textDelta;
            if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: textDelta } }], stage: 'chatting' })}\n\n`);
            }
        }

        if (leadId && fullContent.trim()) {
            await insertChatLog(leadId, 'assistant', fullContent, null, false).catch(console.error);
        }

        if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
            res.end();
        }

    } catch (err: any) {
        console.error("[Fatal Chat Handler Error]:", err);
        const errorMsg = "Mmm, perdí un segundo la conexión. ¿Podés repetirme el nombre? 😊";
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: errorMsg } }], stage: 'error' })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        }
    }
}
