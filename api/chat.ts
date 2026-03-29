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
                    new Promise<null>((r) => setTimeout(() => r(null), 7000))
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
        const pendingSatoriItems: { toolName: string; data: any[]; part?: number; totalParts?: number; customTitle?: string }[] = [];
        let categoriesAlreadyQueued = false;
        const processedToolCalls = new Set<string>();

        // Función auxiliar para encolar items de Satori (Evita duplicados por ID de herramienta)
        const enqueueSatoriItems = (toolName: string, toolResult: any, toolCallId?: string) => {
            if (!toolResult) return;
            if (toolCallId && processedToolCalls.has(toolCallId)) return;
            if (toolCallId) processedToolCalls.add(toolCallId);
            
            // Extracción robusta de items (Normalización v4)
            let finalData: any[] = [];
            if (Array.isArray(toolResult)) {
                finalData = toolResult;
            } else if (toolResult && typeof toolResult === 'object') {
                if (toolResult.success === false) return;
                // Soporte para múltiples llaves comunes en la respuesta de la base de datos/IA
                const possibleKeys = ['servicios', 'categories', 'categorias', 'items', 'results', 'data'];
                for (const key of possibleKeys) {
                    if (Array.isArray(toolResult[key])) {
                        finalData = toolResult[key];
                        break;
                    }
                }
                // Si no encontramos llaves pero el objeto en sí tiene label/nombre, lo envolvemos en array
                if (finalData.length === 0 && (toolResult.label || toolResult.nombre || toolResult.name)) {
                    finalData = [toolResult];
                }
            }

            if (finalData.length === 0) return;

            // Extraer título real si viene en el resultado
            let resolvedTitle = toolName === 'listar_categorias_principales' ? 'NUESTRAS ESPECIALIDADES' : 'SERVICIOS DISPONIBLES';
            
            // Normalizar items (Asegurar label y price)
            const normalizedData = finalData.map(item => {
                const label = item.label || item.nombre || item.name || item.title || "Servicio";
                const price = item.price !== undefined ? item.price : 0;
                const category = item.category || item.categoria || item.category_name;
                return { label, price, category };
            }).filter(item => item.label && item.label !== "Servicio");

            if (normalizedData.length === 0) return;

            if (normalizedData[0].category) {
                resolvedTitle = `SERVICIOS DE ${String(normalizedData[0].category).toUpperCase()}`;
            }

            const chunkSize = 15;
            const totalChunks = Math.ceil(normalizedData.length / chunkSize);

            for (let i = 0; i < normalizedData.length; i += chunkSize) {
                const chunkData = normalizedData.slice(i, i + chunkSize);
                console.log(`[DIAG-ZORRO] QUEUING: ${toolName} (ID: ${toolCallId}) Part ${i / chunkSize + 1}/${totalChunks}`);
                pendingSatoriItems.push({ 
                    toolName, 
                    data: chunkData, 
                    part: i / chunkSize + 1,
                    totalParts: totalChunks,
                    customTitle: resolvedTitle
                });
            }
            if (toolName === 'listar_categorias_principales') categoriesAlreadyQueued = true;
        };

        try {
            const result = streamText({
                model,
                system: systemPrompt,
                messages, 
                tools,
                maxSteps: 4,
                abortSignal: controller.signal,
                onFinish: (finishResult: any) => {
                    console.log(`[DIAG-ZORRO] onFinish triggered. Tools: ${finishResult.toolResults?.length || 0}`);
                    finishResult.toolResults?.forEach((tr: any) => {
                        const tName = tr.toolName;
                        if (tName === 'listar_categorias_principales' || tName === 'consultar_servicios') {
                            enqueueSatoriItems(tName, tr.result, tr.toolCallId);
                        }
                    });
                }
            } as any);

            for await (const chunk of result.fullStream) {
                chunkCount++;

                if (chunk.type === 'text-delta') {
                    const text = (chunk as any).textDelta || (chunk as any).text || '';
                    if (text) {
                        fullText += text;
                        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
                    }
                }

                if (chunk.type === 'tool-result') {
                    const tr = chunk as any;
                    const toolName = tr.toolName || 'unknown';
                    const toolResult = tr.result ?? tr.output ?? null;
                    
                    console.log(`[DIAG-ZORRO] Stream chunk: tool-result -> ${toolName}`);
                    
                    if (toolName === 'registrar_cliente' && !categoriesAlreadyQueued) {
                        try {
                            const { getCategories } = await import('./_services/db.js');
                            const cats = await getCategories();
                            enqueueSatoriItems('listar_categorias_principales', cats);
                        } catch (e) {
                            console.error("[chat.ts] Bunker fail:", e);
                        }
                    }

                    if (toolName === 'listar_categorias_principales' || toolName === 'consultar_servicios') {
                        enqueueSatoriItems(toolName, toolResult, tr.toolCallId);
                    }
                }

                if (chunk.type === 'error') {
                    console.error(`[chat.ts] ERROR CHUNK:`, JSON.stringify(chunk));
                }
            }

            // --- CRITICAL SYNC: Wait for EVERYTHING to finish before processing items ---
            await result.done;
            console.log(`[DIAG-ZORRO] result.done finished. Final queue size: ${pendingSatoriItems.length}`);

        } catch (streamErr: unknown) {
            const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
            console.error(`[chat.ts] STREAM CATCH — error: ${errMsg}`);
            if (fullText.length === 0) {
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Disculpá, tuve un problema técnico. ¿Podés intentar de nuevo? 🙏" } }] })}\n\n`);
            }
        }

        clearTimeout(timeout);

        // --- 4. Satori post-stream (PARALLEL) ---
        if (pendingSatoriItems.length > 0) {
            console.log(`[DIAG-ZORRO] Processing ${pendingSatoriItems.length} Satori items...`);
            
            // Deduplicar: Mismo título y mismo fragmento de datos
            const uniqueItems = pendingSatoriItems.filter((v, i, a) => 
                a.findIndex(t => t.customTitle === v.customTitle && t.part === v.part) === i
            );

            await Promise.all(uniqueItems.map(async (item) => {
                try {
                    let title = item.customTitle || 'KÂLON ESTÉTICA';
                    if (item.totalParts && item.totalParts > 1) {
                        title += ` (${item.part}/${item.totalParts})`;
                    }

                    const menuItems = (item.data as any[]).map((r: any) => ({
                        label: r.nombre || r.label || r.title || r.name || r.categoria || r.servicio || 'Servicio',
                        price: r.precio || r.price || undefined
                    })).filter(mi => mi.label !== 'Servicio');

                    console.log(`[DIAG-ZORRO] Processed ${menuItems.length} items for ${title}. Sample: ${menuItems[0]?.label}`);

                    if (menuItems.length === 0) {
                        console.warn(`[DIAG-ZORRO] Skipping empty Satori item (after filter): ${title}`);
                        return;
                    }
                    
                    const startIndex = ((item.part || 1) - 1) * 15;
                    console.log(`[DIAG-ZORRO] Generating ${title} with ${menuItems.length} items (start: ${startIndex})...`);
                    const buf = await generateMenuImage(title, menuItems, startIndex);
                    
                    if (buf) {
                        const base64 = Buffer.from(buf).toString('base64');
                        console.log(`[DIAG-ZORRO] Satori Success: ${title} (${base64.length} bytes)`);
                        res.write(`data: ${JSON.stringify({ media_url: `data:image/png;base64,${base64}` })}\n\n`);
                    } else {
                        console.error(`[DIAG-ZORRO] Satori Fail (null buffer) for: ${title}`);
                    }
                } catch (e) {
                    console.error('[DIAG-ZORRO] Satori mapping/gen fail:', e);
                }
            }));
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
