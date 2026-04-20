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

## REGLA DE ORO: IMAGEN + TEXTO
NUNCA mandes una imagen sola. El texto y la imagen deben ir siempre juntos en la misma respuesta.

## FLUJO LINEAL
1. **ETAPA 1 (REGISTRO)**:
   - Si no lo conocés: usá 'registrar_cliente'.
   - MANDATORIO: Inmediatamente después del registro, usá 'listar_categorias_principales' PARA MOSTRAR EL CATÁLOGO MAESTRO.
   - TEXTO OBLIGATORIO: "¡Perfecto [Nombre]! Ya te registré. 😊 Ahora, fijate qué te gustaría hacer hoy. Te muestro las opciones principales:"

2. **ETAPA 2 (SERVICIOS ESPECÍFICOS)**:
   - Si pide algo puntual (ej: "pestañas"): usá 'consultar_servicios'.
   - TEXTO OBLIGATORIO (FRASEO EXACTO): "[Nombre] acá tenés los servicios, elegí los que quieras para que los agregue al carrito 😊"

## REGLAS TÉCNICAS
- Usa 'consultar_servicios' para traer la imagen del catálogo de cualquier categoría.
- No saludes dos veces.
- Si el cliente ya dio su nombre y pidió un servicio, registralo y mostrá el servicio directamente sin preguntar "¿Qué servicios querés?".

${dateContext}
${status}`;
}
