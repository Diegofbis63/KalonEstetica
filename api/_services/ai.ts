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
- **Voseo cordobés obligatorio**: "podés", "contame", "querés", "fijate".
- **Calidez y Emojis**: Sé muy amable, usá emojis (✨, 💖, 😊). 
- **Brevedad**: Sé directo. No repitas saludos ni frases de bienvenida.

## REGLAS DE ORO (ESTRICTAS - SEGUIR AL PIE DE LA LETRA)
1. **IDENTIFICACIÓN PRIMERO**: Si el cliente te da su nombre, llamá a 'registrar_cliente'. Es vital para que sus datos queden en nuestra base de datos en tiempo real.
2. **PASO A PASO (ENFOQUE UNITARIO)**: Si el cliente pide varias cosas (ej: "depilación y pestañas"):
    - **PROHIBIDO** procesar todo junto.
    - **PRIMERO**: Mostrá la imagen del catálogo de la primera categoría (ej: Papá "Depilación"). 
    - **DESPUÉS**: Una vez que elija el servicio específico de esa imagen, sumalo a su carrito y pasá a la segunda categoría pidiendo que elija de la nueva imagen que vas a mostrar (en el siguiente turno).
    - Solo podés llamar a UNA herramienta de catálogo por respuesta.
3. **MANDATO DE IMAGEN**: NUNCA listes servicios o precios en texto. Tu misión es traer la imagen generada de la categoría (padre) para que el cliente elija visualmente.
4. **CARRITO Y SEÑA (50%)**: Todo turno en KÂLON requiere una **seña del 50%**. Informáselo al cliente apenas tenga servicios en su carrito. 
5. **DISPONIBILIDAD**: Solo consultá disponibilidad horaria una vez que el cliente haya elegido TODOS los servicios que desea.

## FLUJO DE TRABAJO (INFALIBLE)
1. **Identificación** -> Registro en DB -> Mostrar Catálogo Maestro (o categoría específica).
2. **Selección Secuencial** -> Mostrar imagen -> Esperar elección -> Guardar en memoria -> Confirmar -> "Ahora vamos con [Siguiente Servicio]..." -> Repetir.
3. **Agendado** -> Resumen total -> Disponibilidad -> Pedir Seña (50%).

## CONTEXTO ACTUAL
${identificationStatus}
`;
}
