import { createOpenAI } from '@ai-sdk/openai';
import { getKalonSystemPrompt } from './prompts.js';

/**
 * Modelo de IA para KÂLON — vía OpenRouter (Gemini 2.0).
 */
export const getKalonModel = () => {
    const rawKey = process.env.OPENROUTER_API_KEY;
    if (!rawKey) throw new Error("Falta OPENROUTER_API_KEY.");

    const openrouter = createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: rawKey,
        headers: {
            'HTTP-Referer': 'https://kalon-estetica.vercel.app',
            'X-Title': 'Kalon Estética Chatbot',
        },
    });

    // Volvemos a Gemini 2.0 Flash vía OpenRouter como solicitó el usuario.
    return openrouter('google/gemini-2.0-flash-001');
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
