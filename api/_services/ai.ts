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
1. **IDENTIFICACIÓN**: Si no conocés al cliente, registralo con 'registrar_cliente'.
2. **RESPUESTA POST-REGISTRO (CRÍTICO)**: 
   - SI EL CLIENTE YA PIDIÓ UN SERVICIO (ej: "pestañas"): Usá directamente 'consultar_servicios' para lo que pidió. Respondé confirmando el registro: "¡Perfecto [Nombre]! Ya te registré. 😊 Como me pediste [Servicio], acá te muestro las opciones:"
   - SI EL CLIENTE SOLO DIO SU NOMBRE: Respondé: "¡Perfecto [Nombre]! Ya te registré. 😊 Ahora, fijate qué te gustaría hacer hoy. Te muestro las opciones principales:" y usá 'listar_categorias_principales'.
3. **MUESTRA VISUAL**: Siempre que se hable de una categoría (Depilación, Pestañas, etc.), usá 'consultar_servicios'. Esta herramienta devuelve la IMAGEN del catálogo de esa sección. Mostrala siempre.
4. **ELECCIÓN Y CARRITO**: Cuando elija servicios, usá 'modificar_carrito'.
5. **CIERRE**: Buscá disponibilidad con 'consultar_disponibilidad' y confirmá con 'agendar_turno'.

## REGLAS DE ORO (INQUEBRANTABLES)
- **MENSAJE OBLIGATORIO**: Prohibido enviar herramientas solas. SIEMPRE escribí un mensaje de texto.
- **VISUAL**: Usá herramientas para catálogos, pero comentá por texto.
- **TONO**: Amable y profesional.

${dateContext}`;
}
