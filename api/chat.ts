import { VercelRequest, VercelResponse } from '@vercel/node';
import { streamText, convertToCoreMessages } from 'ai';
import { getKalonModel, getSystemPrompt } from './_services/ai.js';
import { buildTools } from './_services/ai_tools.js';
import { findLeadByInitId } from './_services/db.js';
import { generateMenuImage } from './_services/imageGenerator.js';

/**
 * HANDLER DE CHAT KÂLON — VERSIÓN DEFINITIVA
 * 
 * Arquitectura:
 * 1. SSE Headers + body parsing
 * 2. Lead lookup (con timeout de 2s, si falla seguimos sin lead)
 * 3. streamText con AbortController de 25s globales
 * 4. Consumir fullStream: texto → SSE, tool-result → acumular para Satori post-stream
 * 5. Satori se ejecuta DESPUÉS del texto (no bloquea el stream)
 * 6. [DONE]
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // --- SSE Setup ---
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

        // --- 1. Lead Lookup (fast, best-effort) ---
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
                console.log('[chat.ts] Lead lookup failed, continuing without lead');
            }
        }

        // --- 2. Prepare AI Call ---
        const model = getKalonModel();
        const coreMessages = convertToCoreMessages(messages);
        const systemPrompt = getSystemPrompt(leadId, coreMessages.length);
        const tools = buildTools(leadId, null, initId);

        // --- 3. AbortController: 25s total timeout ---
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            console.warn('[chat.ts] GLOBAL TIMEOUT: 25s reached, aborting stream');
            controller.abort();
        }, 25000);

        // --- 4. Start streaming ---
        const result = streamText({
            model,
            system: systemPrompt,
            messages: coreMessages,
            tools,
            maxSteps: 4,
            abortSignal: controller.signal,
        });

        // Acumuladores
        let fullText = "";
        let pendingSatoriItems: { toolName: string; data: unknown[] }[] = [];

        // --- 5. Consumir fullStream ---
        try {
            for await (const chunk of result.fullStream) {
                if (chunk.type === 'text-delta') {
                    const text = chunk.textDelta;
                    fullText += text;
                    const payload = JSON.stringify({ choices: [{ delta: { content: text } }] });
                    res.write(`data: ${payload}\n\n`);
                }

                if (chunk.type === 'tool-result') {
                    const { toolName, result: toolResult } = chunk;
                    console.log(`[chat.ts] Tool completed: ${toolName}`);
                    
                    // Acumular resultados para Satori DESPUÉS del stream de texto
                    if (
                        (toolName === 'listar_categorias_principales' || toolName === 'consultar_servicios') &&
                        Array.isArray(toolResult) && toolResult.length > 0
                    ) {
                        pendingSatoriItems.push({ toolName, data: toolResult });
                    }
                }
            }
        } catch (streamErr: unknown) {
            const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
            if (msg.includes('abort')) {
                console.warn('[chat.ts] Stream aborted by timeout');
            } else {
                console.error('[chat.ts] Stream error:', msg);
            }
        }

        clearTimeout(timeout);

        // --- 6. Post-stream: Generar imágenes Satori sin bloquear ---
        for (const item of pendingSatoriItems) {
            try {
                const title = item.toolName === 'listar_categorias_principales'
                    ? 'NUESTRAS ESPECIALIDADES'
                    : 'SERVICIOS DISPONIBLES';
                
                const menuItems = item.data.map((r: any) => ({
                    label: r.nombre || r.name || r.categoria || 'Servicio',
                    price: r.precio || r.price || undefined
                }));

                const buf = await generateMenuImage(title, menuItems);
                if (buf) {
                    const base64 = `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
                    res.write(`data: ${JSON.stringify({ media_url: base64 })}\n\n`);
                }
            } catch (satoriErr) {
                console.error('[chat.ts] Satori generation failed (non-blocking):', satoriErr);
            }
        }

        // --- 7. Cierre limpio ---
        console.log(`[chat.ts] DONE — text length: ${fullText.length}, satori items: ${pendingSatoriItems.length}`);
        res.write(`data: [DONE]\n\n`);
        res.end();

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[chat.ts] FATAL ERROR:', msg);
        
        // Intentar enviar un mensaje de error al cliente
        try {
            res.write(`data: ${JSON.stringify({
                choices: [{ delta: { content: "Disculpá, tuve un problema técnico. ¿Podés intentar de nuevo? 🙏" } }]
            })}\n\n`);
            res.write(`data: [DONE]\n\n`);
        } catch { /* response already closed */ }
        
        res.end();
    }
}
