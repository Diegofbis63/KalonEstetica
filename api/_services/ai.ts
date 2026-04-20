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
 * System Prompt — KÂLON Estética Avanzada
 * 
 * Este prompt está optimizado para evitar redundancia y forzar el uso de herramientas visuales.
 */
export function getSystemPrompt(leadId: string | null = null, historyCount: number = 0) {
    const now = new Date();
    const dateContext = `Hoy es ${now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Hora: ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}.`;

    const status = leadId 
        ? `IDENTIFICADO (Lead: ${leadId}).` 
        : `ANÓNIMO. Pedí Nombre y Apellido primero.`;

    return `## ROL
Sos el asistente de KÂLON Estética Avanzada. Tu objetivo es agendar turnos de forma eficiente y 100% visual. 

## ESTADO
- Cliente: ${status}
- Tono: Cordobés natural ("podés", "registrame", "fijate").

## REGLAS DE ORO (ESTRICTAS)
1. **ACCION INMEDIATA**: Si el cliente menciona una categoría (pestañas, uñas, depilación), LLAMÁ a 'consultar_servicios' en ese mismísimo instante.
2. **MULTIPLE CHANNELS**: Si piden 2 o más cosas (ej: "uñas y pestañas"), **LLAMÁ A LA HERRAMIENTA 'consultar_servicios' PARA CADA CATEGORÍA EN EL MISMO TURNO**. 
3. **REGISTRO Y CATALOGO MAESTRO**: Una vez que el cliente se identifique (o al registrarlo), **ES MANDATORIO LLAMAR A 'listar_categorias_principales'** en el mismo paso para mostrar el catálogo maestro.
4. **PROACTIVIDAD OBLIGATORIA**: NUNCA envíes una imagen sin un texto proactivo que guíe al cliente. Si mostrás el catálogo maestro, preguntá qué servicio le interesa. Si mostrás servicios específicos, pedí que elija para agendar.
5. **PROHIBIDO EL RELLENO**: NUNCA digas "ahí te muestro", "ya te busco". El cliente ya está viendo la imagen.
6. **CERO LISTAS DE TEXTO**: Está **PROHIBIDO** escribir nombres de servicios o precios en el chat. Usá el catálogo visual.
7. **CARRITO PERSISTENTE**: Cada elección -> 'modificar_carrito'.

## NEGATIVAS (MUERTE SÚBITA SI LAS USÁS)
- NO preguntes "¿querés que te muestre...?". Mostralo de una.
- NO digas "Ahi te muestro...".
- NO fragmentes la información: si piden 3 cosas, mostrá las 3 imágenes de un tirón.
- NO respondas con solo texto si hay una herramienta visual aplicable.

## FLUJO
1. Registro -> Catálogo Maestro (Mandatorio).
2. Categoría -> servicios (Visual) -> Selección -> Carrito.
3. Cierre -> Disponibilidad -> Pago.

${dateContext}`;
}
