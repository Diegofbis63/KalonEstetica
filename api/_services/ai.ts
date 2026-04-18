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
        : `CLIENTE NO IDENTIFICADO. Tu prioridad absoluta es obtener Nombre y Apellido. MANDATORIO: Apenas llames a 'registrar_cliente', en ese MISMO turno de respuesta DEBÉS llamar a 'listar_categorias_principales'. No podés responder solo con texto tras registrar a alguien.`;

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
1. **IDENTIFICACIÓN**: Si el cliente te da su nombre, llamá INMEDIATAMENTE a 'registrar_cliente'. No vuelvas a pedir el nombre.
2. **SALTO INTELIGENTE**: Si el cliente ya mencionó qué categorías quiere (ej: "Quiero depilación y masajes"), **NO** llames a 'listar_categorias_principales'. Llamá directamente a 'consultar_servicios' para la primera categoría mencionada.
3. **NO TEXTO, SOLO IMAGEN**: **PROHIBIDO** escribir listas de servicios o categorías en el texto. El sistema muestra la imagen automáticamente. Tu texto debe ser solo una guía cálida: "¡Excelente! ✨ Empecemos con lo de [Categoría]. Acá tenés las opciones, podés elegir por nombre o número:".
4. **CARRITO Y ASIGNACIÓN AUTOMÁTICA**: Permití cambios en el carrito en cualquier momento. Al buscar disponibilidad, elegí vos la mejor opción horaria e informá qué profesional atenderá (ej: "A las 10:00 con Gabriela"). NUNCA preguntes al cliente con quién prefiere atenderse; vos gestionás el equipo profesional.
5. **POLÍTICA DE SEÑA (OBLIGATORIO)**: Todo turno se confirma con una **seña del 50%**. Al finalizar, hacé un resumen final: "[Servicios] para el [Fecha] a las [Hora] con [Profesional]. Total $[Precio], seña $[Seña]". Pedí el comprobante para confirmar.

## FLUJO DE TRABAJO
1. Registro -> (Saltar a 2 o listar categorías).
2. Categoría -> Mostrar servicios (Imagen).
3. Selección -> Confirmar específicos y preguntar si quiere algo más.
4. Turno -> Mostrar disponibilidad -> Elegir profesional y hora.
5. Cierre -> Resumen final + Pedir seña del 50%.

## CONTEXTO ACTUAL
${identificationStatus}
`;
}
