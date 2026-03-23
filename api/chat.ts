import { 
    getChatHistory, 
    insertChatLog, 
    findLeadByFlexiblePhone,
    db
} from './_services/db.js';
import { sql as drizzleSql } from 'drizzle-orm';
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

export default async function handler(req: Request) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    const DEFAULT_ORG_ID = 'kalon-estetica';

    try {
        const body = await req.json().catch(() => ({}));
        let incomingMessage = body.message || "";
        const messages = body.messages || [];
        const userIdRaw = body.userId || "";
        const userId = userIdRaw ? userIdRaw.split('@')[0].replace(/\D/g, '') : null;

        console.log(`[Edge] Request: ${req.method}, User: ${userId}, Msg: "${incomingMessage}"`);

        // IDENTIFY LEAD (Optimized for Edge)
        const identificationId = userId || (body.identificationId || body.userId || (body.clientPhone?.length > 5 ? body.clientPhone : null));
        let leadId: string | null = null;

        if (identificationId) {
            const idStr = identificationId.toString();
            const normalizedPhone = idStr.replace(/\D/g, '');
            try {
                let lead = normalizedPhone.length >= 8 ? await findLeadByFlexiblePhone(normalizedPhone) : null;
                if (!lead && idStr.length > 5) {
                    const results = await db.query.leads.findMany({
                        where: drizzleSql`contact_info->>'uuid' = ${idStr} OR contact_info->>'phone' = ${idStr}`,
                        limit: 1
                    });
                    if (results.length > 0) lead = results[0];
                }
                leadId = lead?.id || null;
            } catch (dbErr) {
                console.error("[Edge] DB Lead Identification Error:", dbErr);
            }
        }

        // HISTORY & CONTEXT
        let coreMessages: any[] = [];
        if (leadId) {
            try {
                const history = await getChatHistory(leadId);
                coreMessages = history.map(h => ({
                    role: h.role === 'user' ? 'user' : 'assistant',
                    content: h.content || ''
                }));
            } catch (histErr) {
                console.error("[Edge] History Fetch Error:", histErr);
            }
        } 
        
        if (coreMessages.length === 0) {
            coreMessages = messages.map((m: any) => ({
                role: m.role,
                content: m.content
            }));
        }

        if (incomingMessage && (!coreMessages.length || coreMessages[coreMessages.length-1].content !== incomingMessage)) {
            coreMessages.push({ role: 'user', content: incomingMessage });
        }

        // FALLBACK: If still empty, add a default greeting to trigger Gemini
        if (coreMessages.length === 0) {
            coreMessages.push({ role: 'user', content: 'Hola' });
        }

        const systemPrompt = getSystemPrompt(new Date());
        const tools = buildTools(leadId, DEFAULT_ORG_ID);

        if (userId) {
            // WHATSAPP (Sync)
            const result = await generateText({
                model: kalonModel,
                system: systemPrompt,
                messages: coreMessages,
                tools,
                maxSteps: 5
            });
            if (leadId) await insertChatLog(leadId, 'assistant', result.text, null, true);
            return new Response(JSON.stringify({ 
                responseText: formatForWhatsApp(result.text), 
                botResponse: formatForWhatsApp(result.text),
                stage: 'chatting' 
            }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

        } else {
            // WEB WIDGET (Stream)
            const result = streamText({
                model: kalonModel,
                system: systemPrompt,
                messages: coreMessages,
                tools,
                maxSteps: 5,
            });

            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                async start(controller) {
                    try {
                        // Handshake
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "" } }], stage: 'chatting' })}\n\n`));

                        for await (const text of result.textStream) {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }], stage: 'chatting' })}\n\n`));
                        }

                        if (leadId) {
                            const fullText = await result.text;
                            await insertChatLog(leadId, 'assistant', fullText, null, false);
                        }
                    } catch (err: any) {
                        console.error("[Edge Stream Error]:", err);
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message, stage: 'error' })}\n\n`));
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
                }
            });
        }

    } catch (e: any) {
        console.error("[chat.ts] Global Catch:", e);
        return new Response(JSON.stringify({ error: e.message }), { 
            status: 500, 
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        });
    }
}
