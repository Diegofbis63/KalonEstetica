/**
 * @deprecated MÓDULO LEGACY — NO USADO EN EL FLUJO ACTIVO
 * 
 * El endpoint activo es `api/chat.ts`, que usa OpenRouter + Gemini 2.5 Flash directamente
 * via el cliente openai SDK. Este módulo (Claude 3.5 Sonnet via Vercel AI SDK) fue
 * el modelo original pero quedó descontinuado. Mantener como referencia únicamente.
 * 
 * Si se necesita volver a Claude: importar getKalonModel() aquí y usarlo en chat.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getKalonModel = () => {
    const rawKey = process.env.OPENROUTER_API_KEY;
    if (!rawKey) throw new Error("Falta OPENROUTER_API_KEY.");

    const { createOpenAI } = require('@ai-sdk/openai');
    const openrouter = createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: rawKey,
        headers: {
            'HTTP-Referer': 'https://kalon-estetica.vercel.app',
            'X-Title': 'Kalon Estética Chatbot',
        },
    });

    return openrouter('anthropic/claude-3.5-sonnet');
};

/**
 * System Prompt — KÂLON Estética Avanzada
 */
export function getSystemPrompt(leadId: string | null = null, currentDate: string = new Date().toISOString()) {
    // Normalizar leadId para evitar que strings como "null" o "undefined" pasen como identificados
    const normalizedLeadId = (leadId === 'null' || leadId === 'undefined' || !leadId) ? null : leadId;
    
    const identifiedStr = normalizedLeadId ? `[CORREO/ID CLIENTE ACTUAL: ${normalizedLeadId}]` : '[ESTADO: CLIENTE NO IDENTIFICADO]';
    const modularPrompt = getKalonSystemPrompt(currentDate);
    
    return `${identifiedStr}\n\n${modularPrompt}`;
}
