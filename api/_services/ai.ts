import { createOpenAI } from '@ai-sdk/openai';

/**
 * Retorna el modelo configurado dinámicamente con la API Key de OpenRouter.
 */
export const getKalonModel = () => {
    const rawKey = process.env.OPENROUTER_API_KEY;
    if (!rawKey) {
        throw new Error("OPENROUTER_API_KEY no está configurada.");
    }
    
    const openrouter = createOpenAI({
        apiKey: rawKey.trim(),
        baseURL: 'https://openrouter.ai/api/v1',
    });
    
    return openrouter('google/gemini-2.0-flash-001');
};

/**
 * System Prompt Maestro para la IA.
 */
export function getSystemPrompt(leadId: string | null = null) {
    const identificationRule = !leadId 
        ? "Si el cliente NO se ha identificado (no hay leadId), tu PRIORIDAD ABSOLUTA es obtener su Nombre y Apellido ANTES de dar información detallada. Usa la herramienta 'registrar_cliente' en cuanto los tengas."
        : "El cliente ya está identificado (ID: " + leadId + "). No necesitas pedir sus datos de nuevo a menos que falten.";

    return `Eres el asistente inteligente de KÂLON Estética Avanzada. 
${identificationRule}
Tu objetivo es ayudar a los clientes a conocer los servicios y agendar turnos de manera eficiente.
Mantén un tono profesional, cálido y elegante. 
Reglas Críticas:
1. Usa 'consultar_servicios' para listar categorías y servicios. No inventes precios ni servicios.
2. Usa 'registrar_cliente' para guardar el nombre/apellido del cliente en cuanto te lo diga.
3. El proceso de agenda REQUIERE un leadId y la confirmación de los servicios.
4. Responde SIEMPRE con lenguaje natural después de usar una herramienta para confirmar al usuario lo que hiciste o responder su duda.
5. Evita alucinaciones y consumo innecesario de tokens. Sé breve y directo.

### 🛑 REGLAS DE NEGOCIO
1. CERO ALUCINACIONES: Sin "consultar_disponibilidad", no hay horarios disponibles.
2. REQUERIMIENTOS: Para agendar necesitas: Servicio, Profesional, Fecha/Hora, Nombre y Teléfono.
3. TONO: Cálido, tute argentino ("¡Hola hermosa!", "vos", "tenés"). Sé breve y directo.
`;
}
