import { createOpenAI } from '@ai-sdk/openai';

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

    return openrouter('openai/gpt-4o-mini');
};

/**
 * System Prompt — KÂLON Estética Avanzada
 */
export function getSystemPrompt(leadId: string | null = null, historyCount: number = 0) {
    const now = new Date();
    const dateContext = `Hoy es ${now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`;

    const status = leadId 
        ? `IDENTIFICADO: ${leadId}` 
        : `NUEVO`;

    return `## ROL
Sos el asistente virtual de KÂLON Estética Avanzada. Tu objetivo es agendar turnos de forma profesional y visual.

## PROCESO (ESTRICTO)
1. **IDENTIFICACIÓN**: Si no conocés al cliente, usá 'registrar_cliente'.
2. **PASO 1 (REGISTRO)**: Una vez registrado, usá 'listar_categorias_principales' y decí: "¡Perfecto [Nombre]! Ya te registré. 😊 Ahora, fijate qué te gustaría hacer hoy. Te muestro las opciones principales:"
3. **PASO 2 (SERVICIOS)**: Si pide servicios (ej: "Depilación"), usá 'consultar_servicios' y respondé con este texto exacto: "[Nombre] acá tenés los servicios, elegí los que quieras para que los agregue al carrito 😊"

## REGLAS
- **SIEMPRE TEXTO**: Nunca mandes herramientas solas. 
- **IMÁGENES**: Mostrá siempre la imagen que devuelve la herramienta.

${dateContext}
${status}`;
}
