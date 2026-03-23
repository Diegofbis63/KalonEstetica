import { streamText, generateText } from 'ai';
import { kalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { formatForWhatsApp } from './_services/utils.js';

export const runtime = 'edge';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Lazy imports to ensure fast response initiation
async function getDbServices() {
    return await import('./_services/db.js');
}

export default async function handler(req: Request) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    const DEFAULT_ORG_ID = 'kalon-estetica';

    try {
        const bodyRaw = await req.json().catch(() => ({}));
        const { message, messages, userId: userIdRaw, clientPhone, identificationId: initId } = bodyRaw;
        
        let incomingMessage = message || "";
        const userId = userIdRaw ? userIdRaw.split('@')[0].replace(/\D/g, '') : null;

        if (userId) {
            // WHATSAPP (Sync path - remains for robustness)
            const { generateText } = await import('ai');
            const { getChatHistory, insertChatLog, findLeadByFlexiblePhone } = await getDbServices();
            
            const normalizedPhone = userId.replace(/\D/g, '');
            let lead = normalizedPhone.length >= 8 ? await findLeadByFlexiblePhone(normalizedPhone) : null;
            let leadId = lead?.id || null;

            let coreMessages: any[] = [];
            if (leadId) {
                const history = await getChatHistory(leadId);
                coreMessages = history.map(h => ({
                    role: h.role === 'user' ? 'user' : 'assistant',
                    content: h.content || ''
                }));
            }
            if (coreMessages.length === 0) {
                coreMessages = (messages || []).map((m: any) => ({ role: m.role, content: m.content }));
            }
            if (incomingMessage) coreMessages.push({ role: 'user', content: incomingMessage });

            const result = await generateText({
                model: kalonModel,
                system: getSystemPrompt(new Date()),
                messages: coreMessages,
                tools: buildTools(leadId, DEFAULT_ORG_ID),
                maxSteps: 5
            });

            if (leadId) await insertChatLog(leadId, 'assistant', result.text, null, true);
            return new Response(JSON.stringify({ responseText: formatForWhatsApp(result.text) }), { 
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
            });
        }

        // WEB WIDGET (Streaming path - INSTANT RESPONSE)
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // STEP 1: Instant Handshake (Prevents 504)
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "" } }], stage: 'chatting' })}\n\n`));

                    // STEP 2: Async Data Preparation (Inside Stream)
                    const { getChatHistory, findLeadByFlexiblePhone, insertChatLog, db } = await getDbServices();
                    const { sql: drizzleSql } = await import('drizzle-orm');

                    const idToIdentify = initId || userIdRaw || (clientPhone?.length > 5 ? clientPhone : null);
                    let leadId: string | null = null;

                    if (idToIdentify) {
                        const idStr = idToIdentify.toString().replace(/\D/g, '');
                        try {
                            const lead = idStr.length >= 8 ? await findLeadByFlexiblePhone(idStr) : null;
                            leadId = lead?.id || null;
                        } catch (e) { console.error("Lead ID Error:", e); }
                    }

                    let coreMessages: any[] = (messages || []).map((m: any) => ({ role: m.role, content: m.content }));
                    if (incomingMessage) coreMessages.push({ role: 'user', content: incomingMessage });
                    
                    // Fallback to "Hola" if empty
                    if (coreMessages.length === 0) coreMessages.push({ role: 'user', content: 'Hola' });

                    // STEP 3: Stream from AI
                    const result = streamText({
                        model: kalonModel,
                        system: getSystemPrompt(new Date()),
                        messages: coreMessages,
                        tools: buildTools(leadId, DEFAULT_ORG_ID),
                        maxSteps: 5,
                    });

                    for await (const text of result.textStream) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }], stage: 'chatting' })}\n\n`));
                    }

                    if (leadId) {
                        const fullText = await result.text;
                        await insertChatLog(leadId, 'assistant', fullText, null, false);
                    }

                } catch (err: any) {
                    console.error("[Fatal Stream Error]:", err);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Lo siento, tuve un problema. Reintenta en un momento.", stage: 'error' })}\n\n`));
                } finally {
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                ...CORS_HEADERS,
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Connection': 'keep-alive'
            }
        });

    } catch (e: any) {
        console.error("[Global Catch]:", e);
        return new Response(JSON.stringify({ error: e.message }), { 
            status: 500, 
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        });
    }
}
