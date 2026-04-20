import { createOpenAI } from '@ai-sdk/openai';
import { getKalonSystemPrompt } from './prompts';

/**
 * Modelo de IA para KÂLON — vía OpenRouter.
 */
export const getKalonModel = () => {
    const rawKey = process.env.OPENROUTER_API_KEY;
    if (!rawKey) throw new Error("Falta API Key.");

    const openrouter = createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: rawKey,
        headers: {
            'HTTP-Referer': 'https://kalon-estetica.vercel.app',
            'X-Title': 'Kalon Estética Chatbot',
        },
    });

    // Se cambia temporalmente a Gemini 2.0 Flash para mayor estabilidad y menor latencia en el procesamiento
    return openrouter('google/gemini-2.0-flash-001');
};

/**
 * System Prompt — KÂLON Estética Avanzada
 */
export function getSystemPrompt(leadId: string | null = null, currentDate: string = new Date().toISOString()) {
    const identifiedStr = leadId ? `[CORREO/ID CLIENTE ACTUAL: ${leadId}]` : '[ESTADO: CLIENTE NO IDENTIFICADO]';
    const modularPrompt = getKalonSystemPrompt(currentDate);
    
    return `${identifiedStr}\n\n${modularPrompt}`;
}
