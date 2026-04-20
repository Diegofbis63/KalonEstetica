import { createOpenAI } from '@ai-sdk/openai';
import { getKalonSystemPrompt } from './prompts.js';

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

    // Usamos el modelo FREE de Google para evitar errores de 402 (créditos)
    // Este modelo es extremadamente rápido y capaz de seguir instrucciones si son claras.
  return openrouter('google/gemini-2.0-flash-lite-preview-02-05:free');
};

/**
 * System Prompt — KÂLON Estética Avanzada
 */
export function getSystemPrompt(leadId: string | null = null, currentDate: string = new Date().toISOString()) {
    const identifiedStr = leadId ? `[CORREO/ID CLIENTE ACTUAL: ${leadId}]` : '[ESTADO: CLIENTE NO IDENTIFICADO]';
    const modularPrompt = getKalonSystemPrompt(currentDate);
    
    return `${identifiedStr}\n\n${modularPrompt}`;
}
