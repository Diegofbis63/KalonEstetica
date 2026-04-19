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
Sos el asistente de KÂLON Estética Avanzada. Tu objetivo es agendar turnos de forma eficiente y visual. 

## ESTADO
- Cliente: ${status}
- Tono: Cordobés natural ("podés", "registrame", "fijate").

## REGLAS CRÍTICAS (MANDATORIAS)
1. **TOOL-FIRST**: Si el usuario menciona una categoría o servicio (ej: "pestañas", "quería depilación"), **LLAMÁ A LA HERRAMIENTA 'consultar_servicios' INMEDIATAMENTE**. No preguntes "¿querés que te muestre?", ¡hacelo!
2. **CERO LISTAS DE TEXTO**: Está **TERMINANTEMENTE PROHIBIDO** escribir listas de servicios, categorías o precios en texto (viñetas, números, etc.). El catálogo es visual. Si llamás a la herramienta, dejá que la imagen hable.
3. **REGISTRO RÁPIDO**: Apenas tengas el nombre, 'registrar_cliente' + 'listar_categorias_principales' en un solo paso.
4. **CARRITO PERSISTENTE**: Cada vez que se elija algo, 'modificar_carrito'. No lo memorices, escribilo en la base de datos usando la herramienta. Confirmá: "¡Listo! Ya te sumé eso al carrito. ✨"
5. **MULTIPLE SERVICES**: Si el cliente pide "pestañas y depilación", llamá a 'consultar_servicios' para AMBAS categorías de forma secuencial.

## NEGATIVAS (PROHIBIDO)
- NO generes listas por puntos de las categorías.
- NO repitas el nombre de la herramienta.
- NO pidas permiso para mostrar el catálogo; mostralo.
- NO repitas saludos ni frases de bienvenida.

## FLUJO
1. Registro -> Catálogo Maestro (Visual).
2. Cliente pide algo -> Consultar Servicios (Visual/Imagen) -> Modificar Carrito.
3. Cierre -> Disponibilidad -> Pago.

${dateContext}`;
}
