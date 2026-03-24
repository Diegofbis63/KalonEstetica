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
            
            // If it's a phone number (mostly digits or short string)
            if (digitsOnly.length >= 8 && !idToIdentify.includes('-')) {
                try {
                    const lead = await findLeadByFlexiblePhone(digitsOnly);
                    leadId = lead?.id || null;
                    if (leadId) console.log("[Chat] Identified by Phone:", leadId);
                } catch (e) { console.error("[Chat] Phone search error:", e); }
            } 
            
            // If not found yet and looks like a UUID (initId)
            if (!leadId && (idToIdentify.includes('-') || idToIdentify.length > 20)) {
                try {
                    const lead = await findLeadByInitId(idToIdentify);
                    leadId = lead?.id || null;
                    if (leadId) console.log("[Chat] Identified by InitId:", leadId);
                } catch (e) { console.error("[Chat] InitId search error:", e); }
            }
        }

        const model = getKalonModel();

        // Build history
        const allMessages = [...(messages || [])];
        const lastInHistory = allMessages.length > 0 ? allMessages[allMessages.length - 1] : null;
        
        if (incomingMessage && (!lastInHistory || lastInHistory.content !== incomingMessage)) {
            allMessages.push({ role: 'user', content: incomingMessage });
        }
        
        if (allMessages.length === 0) {
            allMessages.push({ role: 'user', content: 'Hola' });
        }

        const coreMessages = convertToCoreMessages(allMessages).slice(-10).map(m => {
            if (typeof m.content === 'string') return m;
            if (Array.isArray(m.content)) {
                const textOnly = m.content.every(c => c.type === 'text');
                if (textOnly) {
                    return { 
                        ...m, 
                        content: m.content.map(c => (c as any).text || '').join('\n') 
                    };
                }
            }
            return m;
        });
        
        console.log(`[AI Request] Lead: ${leadId}, Messages: ${coreMessages.length}`);

        const result = streamText({
            model,
            system: getSystemPrompt(leadId),
            messages: coreMessages as any,
            tools: buildTools(leadId, DEFAULT_ORG_ID, initId),
            maxSteps: 3,
            onStepFinish: async (step) => {
                const toolCalls = step.toolCalls;
                for (const call of toolCalls) {
                    if (call.toolName === 'consultar_servicios') {
                        const categories = step.toolResults.find(r => r.toolCallId === call.toolCallId)?.result;
                        if (Array.isArray(categories)) {
                            for (const cat of categories) {
                                try {
                                    const items = cat.servicios.map((s: any) => ({ label: s.titulo, price: s.price }));
                                    const imageBuffer = await generateMenuImage(cat.categoria, items);
                                    const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                                    res.write(`data: ${JSON.stringify({ media_url: base64, stage: 'displaying_menu' })}\n\n`);
                                    console.log(`[Satori] Streamed image for ${cat.categoria}`);
                                } catch (e) {
                                    console.error("[Satori Error]:", e);
                                }
                            }
                        }
                    }
                }
            }
        });

        // Initial Handshake for SSE
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "" } }], stage: 'chatting' })}\n\n`);

        let fullContent = "";
        let chunks = 0;
        
        for await (const text of result.textStream) {
            fullContent += text;
            chunks++;
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }], stage: 'chatting' })}\n\n`);
        }

        console.log(`[AI Stream Done] Content Length: ${fullContent.length}, Chunks: ${chunks}`);

        if (leadId && fullContent.trim()) {
            insertChatLog(leadId, 'assistant', fullContent, null, false).catch(e => console.error("[Log Error]:", e));
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (err: any) {
        console.error("[Fatal Chat Error]:", err);
        const errorMsg = "Lo siento, hubo un error técnico. Por favor, intenta de nuevo.";
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: errorMsg } }], stage: 'error' })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        }
    }
}
