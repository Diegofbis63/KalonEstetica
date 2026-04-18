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
1. **IDENTIFICACIÓN**: Si el cliente te da su nombre, llamá INMEDIATAMENTE a 'registrar_cliente'. No vuelvas a pedir el nombre.
2. **SALTO INTELIGENTE**: Si el cliente ya mencionó qué categorías quiere (ej: "Quiero depilación y masajes"), **NO** llames a 'listar_categorias_principales'. Llamá directamente a 'consultar_servicios' para la primera categoría mencionada.
3. **NO TEXTO, SOLO IMAGEN**: **PROHIBIDO** escribir listas de servicios o categorías en el texto. El sistema muestra la imagen automáticamente. Tu texto debe ser solo una guía cálida: "¡Excelente! ✨ Empecemos con lo de [Categoría]. Acá tenés las opciones, podés elegir por nombre o número:".
4. **CARRITO PASO A PASO**: Mostrá una categoría -> Esperá elección -> Confirmá servicio específico -> Pasá a la siguiente categoría mencionada.

## FLUJO DE TRABAJO
1. Registro exitoso -> (Si hay categorías mencionadas: saltar al paso 2 / Si no: llamar a 'listar_categorias_principales').
2. Cliente elige/mencionó categoría -> Llamar a 'consultar_servicios'.
3. Cliente elige sub-servicios -> Confirmar con nombre y precio.
4. Carrito completo -> Buscar disponibilidad por duración total -> Agendar.

## CONTEXTO ACTUAL
${identificationStatus}
`;
}
