import { streamText, convertToCoreMessages } from 'ai';
import { getKalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { findLeadByFlexiblePhone, insertChatLog, findLeadByInitId } from './_services/db.js';
import { generateMenuImage } from './_services/imageGenerator.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS manual para Node.js Serverless
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // SSE Response Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');

    const DEFAULT_ORG_ID = 'kalon-estetica';

    try {
        const { message, messages, userId: userIdRaw, clientPhone, identificationId: initId } = req.body || {};
        console.log("[Chat] Request started, keys:", Object.keys(req.body || {}));
        
        const incomingMessage = message || "";
        const idToIdentify = initId || userIdRaw || (typeof clientPhone === 'string' && clientPhone.length > 5 ? clientPhone : null);
        let leadId = null;

        if (idToIdentify && typeof idToIdentify === 'string') {
            const digitsOnly = idToIdentify.replace(/\D/g, '');
            
            // Prioridad: Teléfono ( identificación robusta)
            if (digitsOnly.length >= 8 && !idToIdentify.includes('-')) {
                const lead = await findLeadByFlexiblePhone(digitsOnly).catch(() => null);
                leadId = lead?.id || null;
            } 
            
            // Si el cliente NO se presenta con nombre en este mensaje, intentamos recuperar por InitId
            // Pero si el mensaje parece un registro (contiene nombre), ignoramos el InitId previo
            const looksLikeIntro = incomingMessage && incomingMessage.length < 50 && (incomingMessage.toLowerCase().includes('soy') || incomingMessage.toLowerCase().includes('nombre') || incomingMessage.toLowerCase().includes('llamo') || incomingMessage.split(' ').length <= 4);
            
            if (!leadId && !looksLikeIntro && (idToIdentify.includes('-') || idToIdentify.length > 20)) {
                const lead = await findLeadByInitId(idToIdentify).catch(() => null);
                leadId = lead?.id || null;
            }
        }

        const model = getKalonModel();

        // Build history with explicit check to prevent empty calls and ensure roles
        const allMessages = [...(messages || [])];
        const lastInHistory = allMessages.length > 0 ? allMessages[allMessages.length - 1] : null;
        
        if (incomingMessage && (!lastInHistory || lastInHistory.content !== incomingMessage)) {
            allMessages.push({ role: 'user', content: incomingMessage });
        }
        
        if (allMessages.length === 0) {
            allMessages.push({ role: 'user', content: 'Hola' });
        }

        const coreMessages = allMessages.slice(-10).map(m => {
            const role = (m.role === 'assistant' || m.role === 'user' || m.role === 'system') ? m.role : 'user';
            return {
                role,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
            };
        });
        
        console.log(`[AI Request Early] Lead: ${leadId}, Messages: ${coreMessages.length}, Incoming: "${incomingMessage}"`);

        const result = streamText({
            model,
            system: getSystemPrompt(leadId),
            messages: coreMessages as any,
            tools: buildTools(leadId, DEFAULT_ORG_ID, initId),
            maxSteps: 5,
            onStepFinish: async (step) => {
                const stepText = step.text || "";
                console.log(`[Step Done] Type: ${stepText ? 'text' : 'tool'}, Tools: ${step.toolCalls.length}`);
                
                // Si el modelo registró al cliente en este paso, intentamos capturar el nuevo ID para el logging final
                const regResult = step.toolResults.find(r => r.toolName === 'registrar_cliente')?.result as any;
                if (regResult?.success && regResult.id) {
                    console.log("[Chat] NEW Lead Registered during stream:", regResult.id);
                    leadId = regResult.id; // Actualizamos para el logging de onFinish
                }

                for (const call of step.toolCalls) {
                    try {
                        if (call.toolName === 'listar_categorias_principales') {
                            const foundResult = step.toolResults.find(r => r.toolCallId === call.toolCallId)?.result;
                            if (Array.isArray(foundResult)) {
                                console.log(`[Satori] Generando Menú Principal (${foundResult.length} ítems)`);
                                const items = foundResult.map((c: any) => ({ label: c.nombre }));
                                const imageBuffer = await generateMenuImage('NUESTRAS ESPECIALIDADES', items);
                                const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                                if (!res.writableEnded) {
                                    res.write(`data: ${JSON.stringify({ media_url: base64, stage: 'displaying_menu' })}\n\n`);
                                }
                            }
                        }

                        if (call.toolName === 'consultar_servicios') {
                            const foundCategories = step.toolResults.find(r => r.toolCallId === call.toolCallId)?.result;
                            if (Array.isArray(foundCategories)) {
                                for (const cat of foundCategories) {
                                    const items = (cat.servicios || []).map((s: any) => ({ label: s.titulo, price: s.precio }));
                                    const imageBuffer = await generateMenuImage(cat.categoria, items);
                                    const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                                    if (!res.writableEnded) {
                                        res.write(`data: ${JSON.stringify({ media_url: base64, stage: 'displaying_menu' })}\n\n`);
                                    }
                                }
                            }
                        }
                    } catch (toolErr) {
                        console.error("[onStepFinish Tool Exception]:", toolErr);
                    }
                }
            }
        });

        // Primer chunk para avisar al front que estamos vivos
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "" } }], stage: 'chatting' })}\n\n`);

        let fullContent = "";
        
        // Consumimos el stream de texto delta por delta
        for await (const textDelta of result.textStream) {
            fullContent += textDelta;
            if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify({
                    choices: [{ delta: { content: textDelta } }],
                    stage: 'chatting'
                })}\n\n`);
            }
        }

        console.log(`[Stream End] Longitud: ${fullContent.length}, LeadId: ${leadId}`);

        // Persistimos el log en DB si hay texto y lead
        if (leadId && fullContent.trim()) {
            insertChatLog(leadId, 'assistant', fullContent, null, false).catch(e => console.error("[DB Log Error]:", e));
        }

        if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
            res.end();
        }

    } catch (err: any) {
        console.error("[Fatal Chat Handler Error]:", err);
        const errorMsg = "Mmm, parece que perdí la conexión un segundo. ¿Me repetís lo último? 😊";
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: errorMsg } }], stage: 'error' })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        }
    }
}
