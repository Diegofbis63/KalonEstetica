import { updateLeadState } from '../../_services/db.js';
import type { StageContext } from '../types.js';

export async function handleStage5(ctx: StageContext, mediaUrl?: string): Promise<{ assistantContext: string; nextStage?: string }> {
    const { text, leadId, currentState } = ctx;

    console.log(`[Stage 5] Esperando comprobante de pago para lead: ${leadId}`);

    // Detectar URL en el texto si no vino mediaUrl
    const urlInText = text.match(/https?:\/\/[^\s]+/i);
    const effectiveMedia = mediaUrl || (urlInText ? urlInText[0] : null);
    const hasComprobanteKeyword = /comprobante|transferencia|pago|adjunto|acá está|listo|ya transferi|ya esta|enviado/i.test(text.toLowerCase());

    if (effectiveMedia || hasComprobanteKeyword) {
        if (leadId) {
            await updateLeadState(String(leadId), { 
                ...currentState, 
                stage: '6',
                paymentProofUrl: effectiveMedia || 'keyword_detected'
            });
        }
        return { 
            assistantContext: `SISTEMA: Comprobante detectado/notificado. Pasamos a ETAPA 6 para confirmación final.
            TU MISIÓN: Agradecé el envío y decile que aguarde un segundo mientras procesás la confirmación definitiva del turno.`,
            nextStage: '6'
        };
    }

    return { 
        assistantContext: `SISTEMA: Aún no se recibe el comprobante. 
        TU MISIÓN: Recordale al cliente los datos de la cuenta (CBU/Alias) y explicale que el turno se confirma una vez enviado el comprobante de la seña (50%).` 
    };
}
