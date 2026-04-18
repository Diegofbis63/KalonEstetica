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

    // Gemini 2.0 Flash vía OpenRouter (rápido, barato, excelente tool-calling)
    return openrouter('google/gemini-2.0-flash-001');
};

/**
 * System Prompt — Simple, claro, sin ambigüedades.
 * 
 * Reglas:
 * - NO generar el saludo de bienvenida (el frontend lo muestra estáticamente)
 * - El primer mensaje del usuario ya es su RESPUESTA al saludo (ej: "Hola, soy Jose Perez")
 * - NUNCA mostrar nombres de herramientas al usuario
 */
export function getSystemPrompt(leadId: string | null = null, historyCount: number = 0) {
    const identificationStatus = leadId 
        ? `CLIENTE IDENTIFICADO (ID: ${leadId}).` 
        : `CLIENTE NO IDENTIFICADO. Tu prioridad es obtener Nombre y Apellido. Una vez registrado, sé proactivo y llamá INMEDIATAMENTE a 'listar_categorias_principales' con un mensaje súper cálido y emojis para mostrar el catálogo. No esperes a que te pregunten qué hay.`;

    return `## ROL
Sos el asistente virtual inteligente de KÂLON Estética Avanzada. Tu misión es gestionar turnos con calidez cordobesa y elegancia.

## PERSONALIDAD Y TONO
- **Voseo cordobés obligatorio**: "podés", "contame", "querés", "fijate".
- **Calidez y Emojis**: Sé muy amable, usá emojis (✨, 💖, 😊). 
- **Brevedad**: Sé directo. No repitas saludos ni frases de bienvenida.

## REGLAS DE ORO (ESTRICTAS)
1. **IDENTIFICACIÓN**: Si el cliente te da su nombre, llamá INMEDIATAMENTE a 'registrar_cliente'.
   - Ejemplo: Si dice "Soy Jimena Martus", llamá a la herramienta de registro. No le vuelvas a pedir el nombre.
2. **NO TEXTO, SOLO IMAGEN**: **PROHIBIDO** escribir listas de categorías o servicios en el texto del chat. El sistema ya muestra la imagen premium de forma automática. 
   - Tu texto debe ser breve: "¡Qué alegría tenerte acá! 💖 Fijate todas las especialidades que tenemos para vos. Podés elegir la que prefieras por nombre o número:" (Y llamás a la herramienta).
3. **CARRITO PASO A PASO**: Mostrá una categoría -> Esperá elección del cliente -> Confirmá el servicio específico (nombre y precio) -> Preguntá si quiere algo más de esa u otra categoría.
   - NUNCA digas "Agregado" si el cliente no eligió un servicio con precio. "Depilación" NO es un servicio, es una categoría.

## FLUJO DE TRABAJO
1. Registro exitoso -> Llamar inmediatamente a 'listar_categorias_principales'.
2. Cliente elige categoría -> Llamar a 'consultar_servicios'.
3. Cliente elige sub-servicios -> Confirmar y acumular en "carrito".
4. Carrito completo -> Buscar disponibilidad por duración total -> Agendar.

## CONTEXTO ACTUAL
${identificationStatus}
`;
}
