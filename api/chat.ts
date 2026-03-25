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
        });

        let fullAssistantContent = "";
        
        // Consumimos el stream completo nodo a nodo
        for await (const chunk of (result as any).fullStream) {
            try {
                if (chunk.type === 'text-delta') {
                    const text = chunk.textDelta;
                    fullAssistantContent += text;
                    if (!res.writableEnded) {
                        res.write(`data: ${JSON.stringify({
                            choices: [{ delta: { content: text } }],
                            stage: 'chatting'
                        })}\n\n`);
                    }
                }

                if (chunk.type === 'tool-result') {
                    const { toolName, result: toolRes } = chunk;
                    console.log(`[Tool Done] ${toolName}:`, !!toolRes);

                    if (toolName === 'registrar_cliente' && (toolRes as any)?.id) {
                        leadId = (toolRes as any).id;
                        console.log("[Chat] Converted Lead Updated:", leadId);
                    }

                    if (toolName === 'listar_categorias_principales' && Array.isArray(toolRes)) {
                        console.log("[Satori] Injecting Menu Image...");
                        const items = toolRes.map((c: any) => ({ label: c.nombre }));
                        const imageBuffer = await generateMenuImage('NUESTRAS ESPECIALIDADES', items).catch(() => null);
                        if (imageBuffer && !res.writableEnded) {
                            const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                            res.write(`data: ${JSON.stringify({ media_url: base64, stage: 'satori_generated' })}\n\n`);
                        }
                    }

                    if (toolName === 'consultar_servicios' && Array.isArray(toolRes)) {
                        for (const cat of toolRes) {
                            const items = (cat.servicios || []).map((s: any) => ({ label: s.titulo, price: s.precio }));
                            const imageBuffer = await generateMenuImage(cat.categoria, items).catch(() => null);
                            if (imageBuffer && !res.writableEnded) {
                                const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                                res.write(`data: ${JSON.stringify({ media_url: base64, stage: 'satori_generated' })}\n\n`);
                            }
                        }
                    }
                }
            } catch (chunkErr) {
                console.error("[FullStream Chunk Loop Error]:", chunkErr);
            }
        }

        console.log(`[Stream Finalized] Lead: ${leadId}, Length: ${fullAssistantContent.length}`);

        if (leadId && fullAssistantContent.trim()) {
            await insertChatLog(leadId, 'assistant', fullAssistantContent, null, false).catch(console.error);
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
