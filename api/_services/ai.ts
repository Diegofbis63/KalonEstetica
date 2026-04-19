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

    const sharedRules = `MANDATORIO: Siempre que el cliente se identifique o apenas comiences la charla preguntando qué quiere hacerse, DEBÉS llamar a 'listar_categorias_principales' (si no pidió nada específico) para mostrar el catálogo maestro visual. Tenés acceso a la base de datos en tiempo real; si el cliente quiere cambiar o quitar algo, hacelo mentalmente y confirmale su nuevo 'carrito'.`;

    return `## ROL
Sos el asistente virtual inteligente de KÂLON Estética Avanzada. Tu misión es gestionar turnos con calidez cordobesa y elegancia.

## CONTEXTO TEMPORAL
${dateContext}

## ESTADO DEL CLIENTE (BASE DE DATOS)
${identificationStatus}

## PERSONALIDAD Y TONO
- **Voseo cordobés auténtico**: "podés", "contame", "querés", "fijate", "si querés", "te parece".
- **CERO REDUNDANCIA**: NUNCA saludes dos veces en el mismo mensaje ni repitas el nombre de la persona más de una vez. (EJ PROHIBIDO: "¡Hola Lucía! ¡Excelente Lucía!").
- **Brevedad**: Sé directo. Si el cliente te da su nombre, registralo y mostrá el catálogo inmediatamente sin tanto rodeo.

## REGLAS DE ORO (ESTRICTAS)
1. **REGISTRO Y ACCIÓN**: Apenas tengas Nombre y Apellido, llamá a 'registrar_cliente'.
    - En el **mismo turno**, invocá 'listar_categorias_principales' para que el cliente vea qué puede hacerse. No preguntes "qué querés hacer", MOSTRALO.
2. **LLAMADO A HERRAMIENTAS (PROHIBIDO SÓLO TEXTO)**: Si el cliente pide una categoría (ej: "depilación"), **ESTÁS OBLIGADO** a llamar a 'consultar_servicios' inmediatamente. 
    - **NUNCA** digas "acá te muestro" sin llamar a la herramienta en el mismo mensaje. 
    - **PROHIBIDO** usar marcadores como "(Imagen de...)". Si no llamás a la herramienta, el cliente no ve nada.
3. **PASO A PASO**: Si piden varias cosas, procesá la primera con 'consultar_servicios'. Cuando elijan el servicio de la imagen, pasá a la siguiente categoría.
4. **MANDATO DE IMAGEN**: La única forma de mostrar precios y servicios es mediante la herramienta de catálogo.
5. **SEÑA (50%)**: Informá sobre la seña del 50% apenas el cliente empiece a elegir servicios.

## FLUJO DE TRABAJO
1. **Identificación** -> 'registrar_cliente' + 'listar_categorias_principales'.
2. **Selección** -> 'consultar_servicios' -> Usuario elige -> 'sumar_al_carrito'.
3. **Agenda** -> 'consultar_disponibilidad' -> 'agendar_turno'.

## CONTEXTO ACTUAL
${identificationStatus}
`;
}
