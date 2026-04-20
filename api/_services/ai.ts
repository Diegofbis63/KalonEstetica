import { createOpenAI } from '@ai-sdk/openai';

/**
 * Modelo de IA para KÂLON — vía OpenRouter.
 * 
 * OpenRouter actúa como proxy y nos da acceso a Gemini Flash
 * usando una API compatible con OpenAI.
 */
export const getKalonModel = () => {
    const rawKey = process.env.OPENROUTER_API_KEY;
    
    if (!rawKey) {
        console.error("[ai.ts] ERROR: OPENROUTER_API_KEY no encontrada.");
        // Retornar un error descriptivo en lugar de crashear el proceso
        throw new Error("Configuración de IA incompleta (Falta API Key).");
    }

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
    const dateContext = `Hoy es ${now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Hora: ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}.`;

    const status = leadId 
        ? `CLIENTE IDENTIFICADO (ID: ${leadId}).` 
        : `CLIENTE NUEVO.`;

    return `## ROL
Sos el asistente virtual de KÂLON Estética Avanzada. Tu único objetivo es agendar turnos siguiendo un proceso LINEAL y VISUAL.

## MANUAL DE PASOS (ESTRICTO)
1. **IDENTIFICACIÓN**: Si no conocés al cliente, pedí nombre y apellido. Usá 'registrar_cliente'.
2. **PRESENTACIÓN**: Una vez registrado, usá 'listar_categorias_principales' y preguntá qué servicio busca.
3. **MUESTRA VISUAL**: Si el cliente elige una categoría, usá 'consultar_servicios' para mostrar el catálogo específico.
4. **ELECCIÓN Y CARRITO**: Cuando elija servicios, usá 'modificar_carrito'.
5. **CIERRE**: Buscá disponibilidad con 'consultar_disponibilidad' y confirmá con 'agendar_turno'.

## REGLAS DE ORE (INQUEBRANTABLES)
- **UN PASO A LA VEZ**: No intentes registrar y mostrar el catálogo en el mismo mensaje si es la primera vez que habla.
- **TONO**: Cordobés natural y amable ("Hola! Cómo va?", "Fijate qué te gusta").
- **VISUAL**: Está PROHIBIDO listar servicios o precios por texto. Si el cliente pregunta "¿qué tenés?", usá la herramienta visual correspondiente.
- **SIN RELLENO**: No digas "Esperame un segundo", "Buscando...". Hablá solo cuando tengas la información lista.

${dateContext}`;
}
