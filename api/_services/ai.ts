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

    // Cambiado a Gemini 2.0 Flash para mejor estabilidad y mayor ventana de contexto en herramientas
    return openrouter('google/gemini-2.0-flash-001');
};

/**
 * System Prompt — KÂLON Estética Avanzada
 */
export function getSystemPrompt(leadId: string | null = null, historyCount: number = 0) {
    const identifiedStr = leadId ? `CLIENTE IDENTIFICADO (ID: ${leadId})` : 'CLIENTE NUEVO';
    
    return `Eres el Asistente Virtual de KÂLON Estética Avanzada. ${identifiedStr}.
    
REGLA DE ORO: DEBES SER PROACTIVO Y VISUAL.

FLUJO OBLIGATORIO:
1. SI EL CLIENTE ES NUEVO: Pide nombre y apellido. Usa 'registrar_cliente' INMEDIATAMENTE al recibirlos.
2. TRAS EL REGISTRO (O SI YA ESTÁ IDENTIFICADO): Llama a 'listar_categorias_principales' para mostrar el catálogo maestro. NO ESPERES A QUE TE LO PIDAN.
3. AL SELECCIONAR CATEGORÍA: Muestra los servicios con 'consultar_servicios'.

INSTRUCCIONES DE RESPUESTA:
- Usa un tono profesional, cálido y elegante.
- NO digas "en un momento te muestro...". SIMPLEMENTE LLAMA A LA HERRAMIENTA.
- Cuando uses una herramienta que devuelve un 'message', ese texto es TU respuesta inicial.
- Si una herramienta devuelve imágenes (catalogs), el sistema las inyectará automáticamente. Tú solo encárgate de la parte textual para guiar al cliente al siguiente paso.

¡Tu objetivo es que el cliente agende un turno!`;
}
