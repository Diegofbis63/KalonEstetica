import { VercelRequest, VercelResponse } from '@vercel/node';
import { streamText } from 'ai';
import { getKalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { findLeadByInitId } from './_services/db.js';
import { generateMenuImage } from './_services/imageGenerator.js';

/**
 * HANDLER DE CHAT KÂLON — OpenRouter + AI SDK v6
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { messages = [], identificationId } = req.body || {};
        const initId = identificationId || "guest";
        console.log(`[chat.ts] START — initId: ${initId}, messages: ${messages.length}`);

        // --- 1. Lead Lookup ---
        let leadId: string | null = null;
        if (initId && initId !== "guest" && initId.length > 10) {
            try {
                const lead = await Promise.race([
                    findLeadByInitId(initId),
                    new Promise<null>((r) => setTimeout(() => r(null), 2000))
                ]);
                leadId = lead?.id || null;
                console.log(`[chat.ts] Lead found: ${leadId || 'none'}`);
            } catch {
                console.log('[chat.ts] Lead lookup failed');
            }
        }

        // --- 2. Prepare AI ---
        const model = getKalonModel();
        // AI SDK v6: messages se pasan directo, ya no existe convertToCoreMessages
        const systemPrompt = getSystemPrompt(leadId, messages.length);
        const tools = buildTools(leadId, null, initId);

        console.log(`[chat.ts] Calling streamText — msgs: ${messages.length}, leadId: ${leadId}`);

        // --- 3. Stream ---
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            console.warn('[chat.ts] TIMEOUT 25s');
            controller.abort();
        }, 25000);

        let fullText = "";
        let chunkCount = 0;
        const pendingSatoriItems: { toolName: string; data: unknown[] }[] = [];

        try {
            const result = streamText({
                model,
                system: systemPrompt,
                messages, // AI SDK v6 acepta messages directamente
                tools,
                maxSteps: 4,
                abortSignal: controller.signal,
            });

            for await (const chunk of result.fullStream) {
                chunkCount++;

                // AI SDK v6: text-delta usa .text, no .textDelta
                if (chunk.type === 'text-delta') {
                    const text = (chunk as any).textDelta || (chunk as any).text || '';
                    if (text) {
                        fullText += text;
                        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
                    }
                }

                if (chunk.type === 'tool-call') {
                    const tc = chunk as any;
                    console.log(`[chat.ts] TOOL CALL: ${tc.toolName || 'unknown'}(${JSON.stringify(tc.args || tc.input || {}).slice(0, 100)})`);
                }

                if (chunk.type === 'tool-result') {
                    const tr = chunk as any;
                    const toolName = tr.toolName || 'unknown';
                    const toolResult = tr.result || tr.output || null;
                    console.log(`[chat.ts] TOOL RESULT: ${toolName} → ${JSON.stringify(toolResult).slice(0, 200)}`);
                    
                    if (
                        (toolName === 'listar_categorias_principales' || toolName === 'consultar_servicios') &&
                        Array.isArray(toolResult) && toolResult.length > 0
                    ) {
                        pendingSatoriItems.push({ toolName, data: toolResult });
                    }
                }

                if (chunk.type === 'error') {
                    console.error(`[chat.ts] ERROR CHUNK:`, JSON.stringify(chunk));
                }
            }
        } catch (streamErr: unknown) {
            const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
            const errStack = streamErr instanceof Error ? streamErr.stack : '';
            console.error(`[chat.ts] STREAM CATCH — chunks: ${chunkCount}, error: ${errMsg}`);
            if (errStack) console.error(`[chat.ts] STACK: ${errStack}`);
            
            if (fullText.length === 0) {
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Disculpá, tuve un problema técnico. ¿Podés intentar de nuevo? 🙏" } }] })}\n\n`);
            }
        }

        clearTimeout(timeout);

        // --- 4. Satori post-stream ---
        for (const item of pendingSatoriItems) {
            try {
                const title = item.toolName === 'listar_categorias_principales' ? 'NUESTRAS ESPECIALIDADES' : 'SERVICIOS DISPONIBLES';
                const menuItems = (item.data as any[]).map((r) => ({
                    label: r.nombre || r.name || r.categoria || 'Servicio',
                    price: r.precio || r.price || undefined
                }));
                const buf = await generateMenuImage(title, menuItems);
                if (buf) {
                    res.write(`data: ${JSON.stringify({ media_url: `data:image/png;base64,${Buffer.from(buf).toString('base64')}` })}\n\n`);
                }
            } catch (e) {
                console.error('[chat.ts] Satori fail:', e);
            }
        }

        console.log(`[chat.ts] DONE — text: ${fullText.length}, chunks: ${chunkCount}, satori: ${pendingSatoriItems.length}`);
        res.write(`data: [DONE]\n\n`);
        res.end();

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[chat.ts] FATAL:', msg);
        try {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Disculpá, hubo un error. ¿Podés intentar de nuevo? 🙏" } }] })}\n\n`);
            res.write(`data: [DONE]\n\n`);
        } catch { /* closed */ }
        res.end();
    }
}
