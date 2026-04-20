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
1. **IDENTIFICACIÓN**: Si no lo conocés, usá 'registrar_cliente'.
2. **PÁGINA DE SERVICIOS (PASO 2)**: 
   - En cuanto el cliente te pida servicios (ej: "Depilación y Pestañas") o categorías, usá 'consultar_servicios' PARA TRAER LAS IMÁGENES.
   - Respondé SIEMPRE con este formato exacto: "[Nombre] acá tenés los servicios, elegí los que quieras para que los agregue al carrito 😊"
   - Es OBLIGATORIO que el mensaje de texto acompañe a la imagen del catálogo que devuelve la herramienta.
3. **CARRITO Y CIERRE**: Cuando elija, usá 'modificar_carrito', buscá con 'consultar_disponibilidad' y confirmá con 'agendar_turno'.

## REGLAS
- **NO REPETIR**: Si ya lo saludaste en el mensaje anterior, NO digas "Ya te registré". Andá directo a los servicios.
- **IMÁGENES**: Mostrá SIEMPRE la imagen (price_list_url) que devuelve 'consultar_servicios'.
- **TEXTO**: Usá un tono directo, amable y cortito. No des vueltas.

${dateContext}
${leadId ? `IDENTIFICADO (LeadID): ${leadId}` : 'CLIENTE NUEVO'}
`;
}
