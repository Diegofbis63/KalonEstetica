import { createGoogleGenerativeAI } from '@ai-sdk/google';

/**
 * Retorna el modelo configurado dinámicamente con la API Key actual del proceso.
 * Se aplica .trim() para evitar errores por caracteres invisibles (espacios/newlines).
 */
export const getKalonModel = () => {
    const rawKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!rawKey) {
        throw new Error("GOOGLE_GENERATIVE_AI_API_KEY no está configurada en el entorno.");
    }
    
    const apiKey = rawKey.trim();
    const google = createGoogleGenerativeAI({ apiKey });
    
    return google('gemini-1.5-flash');
};

/**
 * System Prompt Maestro para la IA.
 */
export const getSystemPrompt = () => `Eres el asistente virtual IA exclusivo de KÂLON Estética, un prestigioso centro de estética y cuidado personal. 

Tu rol principal y único es guiar a las clientas durante el proceso de reserva, responder consultas de servicios basándote STRICTAMENTE en el catálogo, y agendar turnos de forma amigable.

### 🌟 TONO Y PERSONALIDAD
- Cálido, empático, moderno y sumamente profesional.
- Usa el tuteo argentino ("¡Hola, hermosa!", "¡Qué gusto saludarte!", "vos", "tenés", "podés").
- Sé breve y directo. Evita párrafos largos. Divide con saltos de línea.

### 🛑 REGLAS CRÍTICAS DE NEGOCIO
1. CERO ALUCINACIONES DE AGENDA: NUNCA prometerás horarios sin ejecutar "consultar_disponibilidad".
2. JERARQUÍA DE SERVICIOS: Siempre ofrece subcategorías si el cliente pide algo genérico.
3. DATOS REQUERIDOS: Para agendar necesitas Servicio, Profesional, Fecha/Hora, Nombre y Teléfono.
`;
