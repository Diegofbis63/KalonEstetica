import { streamText, generateText } from 'ai';
import { kalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { formatForWhatsApp } from './_services/utils.js';
import { 
    getChatHistory, 
    insertChatLog, 
    findLeadByFlexiblePhone,
    db
} from './_services/db.js';
import { sql as drizzleSql } from 'drizzle-orm';

export default async function handler(req, res) {
    // CORS manual para Node.js Serverless
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const DEFAULT_ORG_ID = 'kalon-estetica';

    try {
        const { message, messages, userId: userIdRaw, clientPhone, identificationId: initId } = req.body || {};
        
        let incomingMessage = message || "";
        const userId = userIdRaw ? userIdRaw.split('@')[0].replace(/\D/g, '') : null;

        // IDENTIFY LEAD
        const idToIdentify = initId || userIdRaw || (clientPhone?.length > 5 ? clientPhone : null);
        let leadId = null;

        if (idToIdentify) {
            const idStr = idToIdentify.toString().replace(/\D/g, '');
            try {
                const lead = idStr.length >= 8 ? await findLeadByFlexiblePhone(idStr) : null;
                leadId = lead?.id || null;
            } catch (e) { console.error("Lead ID Error:", e); }
        }

        if (userId) {
            // WHATSAPP (Sync path)
            let coreMessages = (messages || []).map((m: any) => ({ role: m.role, content: m.content }));
            if (incomingMessage) coreMessages.push({ role: 'user', content: incomingMessage });

            const result = await generateText({
                model: kalonModel,
                system: getSystemPrompt(),
                messages: coreMessages,
                tools: buildTools(leadId, DEFAULT_ORG_ID),
                maxSteps: 5
            });

            if (leadId) await insertChatLog(leadId, 'assistant', result.text, null, true);
            return res.status(200).json({ responseText: formatForWhatsApp(result.text) });
        }

        // WEB WIDGET (Streaming path)
        let coreMessages = (messages || []).map((m: any) => ({ role: m.role, content: m.content }));
        if (incomingMessage) coreMessages.push({ role: 'user', content: incomingMessage });
        if (coreMessages.length === 0) coreMessages.push({ role: 'user', content: 'Hola' });

        const result = streamText({
            model: kalonModel,
            system: getSystemPrompt(),
            messages: coreMessages,
            tools: buildTools(leadId, DEFAULT_ORG_ID),
            maxSteps: 5,
        });

        // Configurar cabeceras de streaming para Node.js
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Connection', 'keep-alive');

        // Handshake
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "" } }], stage: 'chatting' })}\n\n`);

        for await (const text of result.textStream) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }], stage: 'chatting' })}\n\n`);
        }

        if (leadId) {
            const fullText = await result.text;
            await insertChatLog(leadId, 'assistant', fullText, null, false);
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (e: any) {
        console.error("[Global Catch]:", e);
        if (!res.headersSent) {
            res.status(500).json({ error: e.message });
        } else {
            res.write(`data: ${JSON.stringify({ error: e.message, stage: 'error' })}\n\n`);
            res.end();
        }
    }
}
