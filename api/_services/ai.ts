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

    return openrouter('google/gemini-2.0-flash-001');
};

/**
 * System Prompt — KÂLON Estética Avanzada
 */
export function getSystemPrompt(leadId: string | null = null, historyCount: number = 0) {
    const now = new Date();
    const dateContext = `Hoy es ${now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`;

    return `## ROL
Sos el asistente virtual de KÂLON Estética Avanzada. Tu objetivo es agendar turnos de forma profesional y visual.

## PROCESO LINEAL (ESTRICTO)
1. **ETAPA 1: REGISTRO Y CATÁLOGO MAESTRO**:
   - Si no conocés al cliente, usá 'registrar_cliente'.
   - Inmediatamente después de registrarlo, usá 'listar_categorias_principales' PARA MOSTRAR LA FOTO DEL CATÁLOGO MAESTRO.
   - Respondé: "¡Perfecto [Nombre]! Ya te registré. 😊 Ahora, fijate qué te gustaría hacer hoy. Te muestro las opciones principales:"

2. **ETAPA 2: SERVICIOS ESPECÍFICOS**:
   - Cuando el cliente pida servicios (ej: "Depilación y Pestañas"), usá 'consultar_servicios' PARA TRAER ESAS IMÁGENES.
   - Respondé SIEMPRE con este formato: "[Nombre] acá tenés los servicios, elegí los que quieras para que los agregue al carrito 😊" (En esta etapa NO repitas que ya lo registraste).

3. **CIERRE**: Usá 'modificar_carrito', 'consultar_disponibilidad' y 'agendar_turno'.

## REGLAS
- **IMÁGENES OBLIGATORIAS**: Cada vez que una herramienta devuelva un 'price_list_url', la IA debe asegurarse de que se muestre en el chat.
- **TEXTO ACOMPAÑANTE**: Nunca mandes la foto sola. Siempre con el texto indicado arriba.
- **NO TOCAR LOGICA**: No cambies el orden de estas etapas.

${dateContext}
${leadId ? `IDENTIFICADO: ${leadId}` : 'NUEVO'}
`;
}
