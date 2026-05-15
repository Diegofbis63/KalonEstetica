import OpenAI from 'openai';
import { sql, getCategories, findLeadByInitId } from '../_services/db.js';
import { handleStage1 } from './stages/stage1';
import { handleStage2And3 } from './stages/stage2_3';
import { handleStage4 } from './stages/stage4';
import { handleStage5And6 } from './stages/stage5_6';
import type { ClassificationResult, StageContext, ChatState } from './types';
import type { VercelResponse } from '@vercel/node';

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || 'sk-or-dummy',
});

export async function processChat(reqBody: any, res: VercelResponse) {
    const { messages = [], leadId, identificationId, message, mediaUrl } = reqBody;
    const lastMessage = messages[messages.length - 1];
    const text = (message || lastMessage?.content || '').trim();
    
    // 1. Iniciar Stream de inmediato
    if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Connection', 'keep-alive');
    }

    try {
        // 2. Identificación rápida (Ping a la DB para mantener vivo)
        const initIdPromise = (identificationId && String(identificationId).length > 10 && !leadId) 
            ? findLeadByInitId(String(identificationId)).catch(() => null)
            : Promise.resolve(null);
        
        const leadByIdPromise = (identificationId && identificationId.includes('-') && !leadId)
            ? sql`SELECT * FROM leads WHERE id = ${identificationId} LIMIT 1`.then(r => r[0] || null).catch(() => null)
            : Promise.resolve(null);

        const [fetchedLead, leadById] = await Promise.all([initIdPromise, leadByIdPromise]);
        const leadToUse = fetchedLead || leadById;
        
        let activeLeadId = leadId || leadToUse?.id || null;
        let currentState: ChatState = leadToUse?.current_state || { stage: '1' };
        let currentStage = String(currentState.stage || '1');

        // 3. ENVIAR ID DE LEAD INMEDIATAMENTE SI EXISTE
        if (activeLeadId) {
            res.write(`data: ${JSON.stringify({ leadId: activeLeadId })}\n\n`);
        }

        // 4. Consultas de soporte en paralelo
        const categoriesPromise = getCategories().catch(() => []);
        const servicesPromise = sql`SELECT s.id, s.title, s.category_id FROM services s WHERE s.active = true`.catch(() => []);
        
        // 5. CLASIFICACIÓN (En paralelo con las consultas de soporte)
        const classificationPromise = classifyIntent(text, activeLeadId, currentStage, messages);
        
        const [categories, services, classification] = await Promise.all([
            categoriesPromise, 
            servicesPromise, 
            classificationPromise
        ]);

        const ctx: StageContext = {
            text,
            leadId: activeLeadId,
            identificationId,
            currentState,
            classification,
            categories,
            services,
            mediaUrls: [],
            stage: currentStage
        };

        // 6. EJECUCIÓN DE LÓGICA DE ETAPA
        let stageResult = { assistantContext: "" };
        
        if (currentStage === '1') {
            stageResult = await handleStage1(ctx);
        } else if (currentStage === '2' || currentStage === '3') {
            stageResult = await handleStage2And3(ctx);
        } else if (currentStage === '4') {
            stageResult = await handleStage4(ctx);
        } else if (currentStage === '5' || currentStage === '6') {
            stageResult = await handleStage5And6(ctx, mediaUrl);
        }

        // Si la etapa cambió, actualizar
        if (ctx.leadId && ctx.leadId !== activeLeadId) {
            res.write(`data: ${JSON.stringify({ leadId: ctx.leadId })}\n\n`);
        }

        // Enviar imágenes si se generaron
        for (const url of ctx.mediaUrls) {
            res.write(`data: ${JSON.stringify({ media_url: url, stage: ctx.stage })}\n\n`);
        }

        // 7. STREAM DE IA
        const currentLeadName = (leadToUse as any)?.client_name || ctx.currentState.clientName || 'cliente';
        
        const stream = await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash-001',
            messages: [
                { 
                    role: 'system', 
                    content: getSystemPrompt(currentStage, currentLeadName, stageResult.assistantContext)
                },
                ...messages.map((m: any) => ({ role: m.role as any, content: m.content }))
            ],
            stream: true,
        }, { timeout: 15000 });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error: any) {
        console.error('[Engine] Error:', error);
        res.write(`data: ${JSON.stringify({ error: "Ocurrió un error en la conexión. Por favor, intenta de nuevo." })}\n\n`);
        res.end();
    }
}

async function classifyIntent(text: string, hasLead: boolean, stage: string, history: any[]): Promise<ClassificationResult> {
    // Clasificación rápida por keywords
    const low = text.toLowerCase();
    if (!hasLead && /hola|buen/i.test(low)) return { intent: 'SALUDO', detected_categories: [], is_negation: false };
    
    // Si no es obvio, usamos IA
    try {
        const response = await openai.chat.completions.create({
            model: 'google/gemini-2.0-flash-001',
            messages: [{ 
                role: 'system', 
                content: `Clasifica la intención del usuario para KÂLON Estética. 
                Responde JSON: { "intent": "SALUDO"|"REGISTRO"|"CONSULTA_SERVICIO"|"TURNO"|"OTRO", "detected_categories": [], "detected_name": "...", "is_negation": false }
                Etapa actual: ${stage}` 
            }, { role: 'user', content: text }],
            response_format: { type: 'json_object' }
        }, { timeout: 3000 });

        return JSON.parse(response.choices[0].message.content || '{}');
    } catch {
        return { intent: 'OTRO', detected_categories: [], is_negation: false };
    }
}

function getSystemPrompt(stage: string, name: string, context: string) {
    return `## IDENTIDAD KÂLON
Sos KÂLON, la asistente boutique de "Kâlon Estética Avanzada" en Córdoba. Hablás con elegancia, calidez y voseo cordobés.

## CONTEXTO
Nombre: ${name}. Etapa Actual: ${stage}. ${context}

## REGLAS
- ETAPA 1: Solo pedí nombre y apellido.
- ETAPA 2/3: El sistema YA ENVIÓ el catálogo/presupuesto. NO lo menciones como algo futuro, hablá de lo que el cliente YA ESTÁ VIENDO.
- ETAPA 4: Ofrecé horarios y ayudá a elegir.
- ETAPA 5/6: Guía el pago y confirma.
- Sé concisa (máx 2-3 oraciones). No uses tecnicismos.`;
}
