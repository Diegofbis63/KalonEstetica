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

export default async function handler(req: Request) {
    console.log(`[chat.ts] --- Incoming Request (EDGE) ---`);
    
    // CORS
    const headers = new Headers({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers });
    }

    const DEFAULT_ORG_ID = 'kalon-estetica';

    try {
        const body = await req.json();
        let incomingMessage = body.message || "";
        const messages = body.messages || [];
        const userIdRaw = body.userId || "";
        const userId = userIdRaw ? userIdRaw.split('@')[0].replace(/\D/g, '') : null;
        let incomingMediaUrl = body.mediaUrl || null;

        console.log(`[chat.ts] Request Logic -> User: ${userId}, Msg: "${incomingMessage}"`);

        // 1. CLEAN MEDIA (Legacy)
        const anyUrlMatch = incomingMessage.match(/(https?:\/\/[^\s)]+)/);
        if (anyUrlMatch && !incomingMediaUrl) {
            incomingMediaUrl = anyUrlMatch[1];
            incomingMessage = incomingMessage.replace(new RegExp(`\\(?${anyUrlMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)?`, 'g'), '');
        }

        // 2. IDENTIFY LEAD
        const identificationId = userId || (body.identificationId || body.userId || (body.clientPhone?.length > 5 ? body.clientPhone : null));
        let leadId: string | null = null;

        if (identificationId) {
            const idStr = identificationId.toString();
            const normalizedPhone = idStr.replace(/\D/g, '');
            let lead = normalizedPhone.length >= 8 ? await findLeadByFlexiblePhone(normalizedPhone) : null;
            
            if (!lead && idStr.length > 5) {
                const results = await db.query.leads.findMany({
                    where: drizzleSql`contact_info->>'uuid' = ${idStr} OR contact_info->>'phone' = ${idStr}`,
                    limit: 1
                });
                if (results.length > 0) lead = results[0];
            }

            if (lead) {
                leadId = lead.id;
            } else {
                const { createLead } = await import('./_services/db.js');
                const contactInfo = /^\d+$/.test(idStr) && idStr.length < 15 ? { phone: idStr } : { uuid: idStr };
                const newLead = await createLead(DEFAULT_ORG_ID, 'Cliente', contactInfo);
                leadId = newLead.id;
            }
        }

        // Save USER message
        if (leadId) {
            await insertChatLog(leadId, 'user', incomingMessage, incomingMediaUrl, !!userId);
        }

        // 3. HISTORY
        let coreMessages: any[] = [];
        if (leadId) {
            const history = await getChatHistory(leadId);
            coreMessages = history.map(h => ({
                role: h.role === 'user' ? 'user' : 'assistant',
                content: h.content || ''
            }));
        } else {
            coreMessages = messages.map((m: any) => ({
                role: m.role,
                content: m.content
            }));
            if (incomingMessage) {
                coreMessages.push({ role: 'user', content: incomingMessage });
            }
        }

        const systemPrompt = getSystemPrompt(new Date());
        const tools = buildTools(leadId, DEFAULT_ORG_ID);

        // 4. GENERATION
        if (userId) {
            // WHATSAPP (Sync)
            const result = await generateText({
                model: kalonModel,
                system: systemPrompt,
                messages: coreMessages,
                tools,
                maxSteps: 5
            });

            if (leadId) {
                await insertChatLog(leadId, 'assistant', result.text, null, true);
            }

            return new Response(JSON.stringify({ 
                responseText: formatForWhatsApp(result.text), 
                botResponse: formatForWhatsApp(result.text),
                stage: 'chatting' 
            }), { headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });

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
                        const handshake = { choices: [{ delta: { content: "Conectando con KÂLON..." } }], stage: 'chatting' };
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(handshake)}\n\n`));

                        for await (const text of result.textStream) {
                            const payload = { choices: [{ delta: { content: text } }], stage: 'chatting' };
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                        }

                        if (leadId) {
                            const fullText = await result.text;
                            await insertChatLog(leadId, 'assistant', fullText, null, false);
                        }

                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    } catch (err: any) {
                        console.error("[Edge] Stream Error:", err);
                        const errPayload = { choices: [{ delta: { content: `\n\n[Error: ${err.message}]` } }], stage: 'error' };
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errPayload)}\n\n`));
                    } finally {
                        controller.close();
                    }
                }
            });

            return new Response(stream, {
                headers: {
                    ...Object.fromEntries(headers.entries()),
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'X-Accel-Buffering': 'no',
                }
            });
        }

    } catch (error: any) {
        console.error("[chat.ts] Edge Handler Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}
