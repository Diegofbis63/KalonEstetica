import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getChatHistory, 
    insertChatLog, 
    createLead, 
    findLeadByFlexiblePhone,
    updateLeadState,
    db
} from './_services/db.js';
import { sql as drizzleSql } from 'drizzle-orm';
import { formatForWhatsApp } from './_services/utils.js';
import { streamText, generateText, CoreMessage } from 'ai';
import { kalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log(`[chat.ts] --- Incoming Request: ${req.method} ---`);
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const DEFAULT_ORG_ID = 'kalon-estetica';

    try {
        const body = req.body || {};
        let incomingMessage = body.message || "";
        const userIdRaw = body.userId || "";
        const userId = userIdRaw ? userIdRaw.split('@')[0].replace(/\D/g, '') : null;
        let incomingMediaUrl = body.mediaUrl || null;
        
        console.log(`[chat.ts] --- New Request: "${incomingMessage}", User: ${userId} ---`);

        // 1. CLEAN MEDIA: Extract and remove WhatsApp Bridge placeholders
        const anyUrlMatch = incomingMessage.match(/(https?:\/\/[^\s)]+)/);
        if (anyUrlMatch && !incomingMediaUrl) {
            incomingMediaUrl = anyUrlMatch[1];
            incomingMessage = incomingMessage.replace(new RegExp(`\\(?${anyUrlMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)?`, 'g'), '');
        }

        if (incomingMessage.includes('📸 [Imagen enviada]') || incomingMessage.includes('📷') || incomingMessage.includes('[Foto]')) {
            incomingMessage = incomingMessage.replace(/📸\s*\[Imagen enviada\]/gi, '');
            incomingMessage = incomingMessage.replace(/📷/g, '');
            incomingMessage = incomingMessage.replace(/\[Foto\]/gi, '');
            incomingMessage = incomingMessage.trim();
        } 
        
        if (!incomingMessage.trim() && incomingMediaUrl) {
            incomingMessage = "He enviado una imagen o comprobante."; 
        }

        // 2. IDENTIFY/CREATE LEAD
        console.log("[chat.ts] Stage 2: Identifying lead");
        const identificationId = userId || (body.identificationId || body.userId || (body.clientPhone?.length > 5 ? body.clientPhone : null));
        let leadId: string | null = null;
        let isBotEnabled = true;

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
                isBotEnabled = lead.is_bot_enabled !== false;
            } else {
                const contactInfo = /^\d+$/.test(idStr) && idStr.length < 15 ? { phone: idStr } : { uuid: idStr };
                const newLead = await createLead(DEFAULT_ORG_ID, 'Cliente', contactInfo);
                leadId = newLead.id;
            }
        }

        if (!isBotEnabled) return res.status(200).json({ status: 'bot_disabled' });

        // Save USER message to DB immediately
        if (leadId) {
            await insertChatLog(leadId, 'user', incomingMessage, incomingMediaUrl, !!userId);
        }

        // 3. FETCH CONVERSATION HISTORY
        console.log("[chat.ts] Stage 3: Fetching history & AI generation");
        let coreMessages: CoreMessage[] = [];
        
        if (leadId) {
            const history = await getChatHistory(leadId, 25); // get last 25 messages context
            
            // Format DB logs to CoreMessages compatible with Vercel AI SDK
            coreMessages = history.map(h => ({
                role: h.sender === 'user' ? 'user' : 'assistant',
                content: h.message_text || '' // We omit images in context to save cost right now
            }));
        }

        // Push current message
        coreMessages.push({ role: 'user', content: incomingMessage });

        // 4. CALL VERCEL AI SDK (GEMINI 1.5 FLASH)
        const systemPrompt = getSystemPrompt();
        const tools = buildTools(leadId, DEFAULT_ORG_ID);

        if (userId) { 
            // WHATSAPP (Synchronous Generation)
            // By awaiting generateText with maxSteps, AI SDK automatically handles the tool call loop!
            console.log("[chat.ts] Starting Omnicanal GenAI Generate...");
            const result = await generateText({
                model: kalonModel,
                system: systemPrompt,
                messages: coreMessages,
                tools,
                maxSteps: 5
            });

            if (leadId) {
                await insertChatLog(leadId, 'bot', result.text, null, true);
            }

            return res.status(200).json({ 
                responseText: formatForWhatsApp(result.text), 
                botResponse: formatForWhatsApp(result.text),
                stage: 'chatting' 
            });

        } else { 
            // WEB WIDGET (Streaming Generation)
            console.log("[chat.ts] Starting Web GenAI Stream...");
            const result = streamText({
                model: kalonModel,
                system: systemPrompt,
                messages: coreMessages,
                tools,
                maxSteps: 5,
                // Only save when the entire stream and tool execution loop completes
                onFinish: async ({ text }) => {
                    if (leadId) {
                        await insertChatLog(leadId, 'bot', text, null, false);
                    }
                }
            });

            // Set up compatible headers for existing KalonChat frontend
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            try {
                for await (const part of result.fullStream) {
                    if (part.type === 'text-delta') {
                        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part.textDelta } }], stage: 'chatting' })}\n\n`);
                    } else if (part.type === 'error') {
                        console.error("[chat.ts] AI FullStream Error:", part.error);
                        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n[FullStream Error: ${typeof part.error === 'object' ? JSON.stringify(part.error) : part.error}]` } }], stage: 'error' })}\n\n`);
                    } else {
                        console.log(`[chat.ts] Stream Part: ${part.type}`);
                    }
                }
            } catch (streamError: any) {
                console.error("[chat.ts] Stream error:", streamError);
            } finally {
                res.write('data: [DONE]\n\n');
                res.end();
            }
        }

    } catch (e: any) {
        console.error("[chat.ts] CRITICAL ERROR IN HANDLER:", e);
        if (!res.writableEnded) {
            return res.status(200).json({ responseText: `Error: ${e.message || 'Error desconocido'}. 🧐`, stage: 'error' });
        }
    }
}
