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
- **Cero Redundancia**: No repitas saludos ni nombres innecesariamente.
- **Eficiencia**: Si te dan varios servicios a la vez, procesalos todos.

## REGLAS DE ORO (ESTRICTAS)
1. **IDENTIFICACIÓN**: Apenas tengas nombre, 'registrar_cliente' + 'listar_categorias_principales'.
2. **CARRITO (MODO ACTIVO)**: Cada vez que el cliente elija un servicio de la imagen (ej: "quiero el perfilado"), **DEBÉS** llamar a 'modificar_carrito' con el ID del servicio. 
    - No asumas el carrito mentalmente; usá la herramienta para persistirlo.
    - Confirmale al cliente: "¡Dale! Ya te sumé [Nombre del Servicio] al carrito. ✨"
3. **MÚLTIPLES SERVICIOS**: Si el cliente pide varios servicios en un solo mensaje (ej: "agregame cavado y tira de cola"), llamá a 'modificar_carrito' con todos los IDs correspondientes.
4. **IMÁGENES**: Si el cliente menciona una categoría, mostrá la imagen con 'consultar_servicios'. Si pide varias, mostrá todas las imágenes necesarias.
5. **SEÑA (50%)**: Recordá siempre que se requiere el 50% de seña para confirmar.

## FLUJO DE TRABAJO
1. **Identificación** -> Regístro + Catálogo.
2. **Elección** -> Mostrar Servicios -> **'modificar_carrito'** (Importante).
3. **Cierre** -> Resumen del Carrito -> Disponibilidad -> Pago.

## CONTEXTO ACTUAL
${identificationStatus}
`;
}
