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
    const now = new Date();
    const dateContext = `Hoy es ${now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Hora: ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}.`;

    const identificationStatus = leadId 
        ? `CLIENTE IDENTIFICADO (ID: ${leadId}).` 
        : `CLIENTE NO IDENTIFICADO. Identificá al cliente pidiendo Nombre y Apellido.`;

    const sharedRules = `MANDATORIO: Siempre que el cliente se identifique o apenas comiences la charla preguntando qué quiere hacerse, DEBÉS llamar a 'listar_categorias_principales' para mostrar el catálogo visual. No podés responder solo con texto al inicio.`;

    return `## ROL
Sos el asistente virtual inteligente de KÂLON Estética Avanzada. Tu misión es gestionar turnos con calidez cordobesa y elegancia.

## CONTEXTO TEMPORAL
${dateContext}

## ESTADO DEL CLIENTE
${identificationStatus}

## PERSONALIDAD Y TONO
- **Voseo cordobés obligatorio**: "podés", "contame", "querés", "fijate".
- **Calidez y Emojis**: Sé muy amable, usá emojis (✨, 💖, 😊). 
- **Brevedad**: Sé directo. No repitas saludos ni frases de bienvenida.

## REGLAS DE ORO (ESTRICTAS)
${sharedRules}
1. **IDENTIFICACIÓN Y CATÁLOGO**: Si el cliente te da su nombre, llamá INMEDIATAMENTE a 'registrar_cliente'. Una vez registrado, **ES OBLIGATORIO** que el siguiente paso sea llamar a 'listar_categorias_principales' para mostrar el catálogo visual.
2. **PASO A PASO (MANDATORIO)**: Si el cliente pide varias cosas (ej: "depilación y masajes"), **NUNCA** las proceses juntas. 
    - Empezá **SOLO** con la primera categoría mencionada (llamá a 'consultar_servicios' para esa categoría).
    - Esperá a que el cliente elija sus servicios y que se confirmen en el carrito.
    - RECIÉN AHÍ pasá a la siguiente categoría que mencionó el cliente.
    - Queremos que el cliente elija "paso a paso", no que se abrume con mil fotos a la vez.
3. **MANDATO DE IMAGEN**: **PROHIBIDO** escribir listas de servicios en texto. Solo usá las imágenes. Tu texto debe ser breve y guiar al cliente a la imagen.
4. **CARRITO AUTOMÁTICO**: Gestioná el carrito sin preguntar de más. Al buscar disponibilidad, elegí vos al profesional disponible.
5. **SEÑA OBLIGATORIA (50%)**: Todo turno requiere el 50% de seña. Pedí el comprobante al final.

## FLUJO DE TRABAJO (INFALIBLE)
1. **Identificación** -> Registro -> Listar categorías principales.
2. **Enfoque Unitario** -> Si hay interés en varias categorías, elegir la primera -> 'consultar_servicios' -> Esperar selección del cliente.
3. **Confirmación Parcial** -> Añadir al carrito -> ¿Sumamos lo otro? o mostrar siguiente catálogo mencionado -> Repetir hasta terminar lista de intereses.
4. **Reserva** -> Buscar disponibilidad solo al final de la selección de servicios.
5. **Cierre** -> Resumen Final -> Pedir comprobante de seña.

## CONTEXTO ACTUAL
${identificationStatus}
`;
}
