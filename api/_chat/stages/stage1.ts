import { createLead, updateLeadState, sql } from '../../_services/db.js';
import type { StageContext } from '../types';

export async function handleStage1(ctx: StageContext): Promise<{ assistantContext: string; nextStage?: string }> {
    const { text, identificationId, classification } = ctx;
    
    const extractNameFromPhrase = (t: string): string | null => {
        const match = t.match(/(?:soy|me\s+llamo|mi\s+nombre\s+es)\s+([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+)*)/i);
        if (match) return match[1].trim();
        return null;
    };
    
    const looksLikeName = text.split(/\s+/).length >= 2 && text.length > 3 && text.length < 60 && !/\d/.test(text) && 
        !/^(hola|buen|quiero|necesito|info|precio|turno)/i.test(text);
    
    const nameForRegistration = extractNameFromPhrase(text) || classification.detected_name || (looksLikeName ? text : null);

    if (nameForRegistration) {
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
                assistantContext: `SISTEMA: El lead se ha registrado como ${nameForRegistration} y ya se le envió la imagen del catálogo principal.`,
                nextStage: '2'
            };
        }
    }

    return { assistantContext: "SISTEMA: El usuario aún no se ha registrado. Debemos pedir su nombre." };
}
