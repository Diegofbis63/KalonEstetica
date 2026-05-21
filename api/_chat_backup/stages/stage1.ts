import { createLead, updateLeadState, sql } from '../../_services/db.js';
import type { StageContext } from '../types.js';

export async function handleStage1(ctx: StageContext): Promise<{ assistantContext: string; nextStage?: string }> {
    const { text, identificationId, classification } = ctx;
    
    // Extracción agresiva: buscar nombres propios capitalizados que no sean palabras comunes
    const extractNameFromPhrase = (t: string): string | null => {
        // Patrón 1: "Me llamo X", "Soy X", "Mi nombre es X"
        const introMatch = t.match(/(?:soy|me\s+llamo|mi\s+nombre\s+es|está\s+hablando\s+con)\s+([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+)*)/i);
        if (introMatch) return introMatch[1].trim();

        // Patrón 2: Solo Nombre y Apellido (Dos palabras capitalizadas)
        const nameMatch = t.match(/^([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+)+)$/);
        if (nameMatch) return nameMatch[1].trim();
        
        return null;
    };
    
    // Clasificación de intención prioritaria
    const isRegistrationIntent = classification.intent === 'REGISTRO' || classification.intent === 'SALUDO';
    
    const nameForRegistration = classification.detected_name || extractNameFromPhrase(text) || (
        text.split(/\s+/).length >= 2 && text.length > 3 && text.length < 60 && !/\d/.test(text) ? text : null
    );

    // Si tenemos un nombre o la intención es claramente presentarse
    if (nameForRegistration && isRegistrationIntent) {
        console.log(`[Stage 1] Registrando lead: ${nameForRegistration}`);
        
        // Obtener catálogo principal
        const configRows = await sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []);
        const mainImageUrl = configRows?.[0]?.value || 'https://ijltsqfshvunmngvbeue.supabase.co/storage/v1/object/public/kalon-services/CATALOGO%20KALON.png';

        const newLead = await createLead(null, nameForRegistration, { 
            phone: null,
            source: "chatbot_web", 
            initId: String(identificationId || '') 
        });
        
        if (newLead?.id) {
            await updateLeadState(String(newLead.id), { stage: '2', clientName: nameForRegistration });
            ctx.leadId = newLead.id; // Actualizar el ID en el contexto
            ctx.mediaUrls.push(mainImageUrl);
            return { 
                assistantContext: `SISTEMA: Registro exitoso como "${nameForRegistration}". Se ha enviado el CATALOGO GENERAL (Imagen con todas las áreas). 
                TU MISIÓN: Dar la bienvenida cálida y preguntar específicamente qué área le interesa (Depilación, Estética Facial, etc) para enviarle luego los precios detallados de esa zona. 
                PROHIBIDO: No asumas que ya eligió una zona ni hables de servicios específicos todavía.`,
                nextStage: '2'
            };
        }
    }

    return { assistantContext: "SISTEMA: El usuario aún no se ha registrado. Debemos pedir su nombre." };
}
