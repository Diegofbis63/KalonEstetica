import { updateLeadState, createAppointment } from '../../_services/db.js';
import type { StageContext } from '../types';

export async function handleStage5And6(ctx: StageContext, mediaUrl?: string): Promise<{ assistantContext: string; nextStage?: string }> {
    const { text, leadId, currentState, stage } = ctx;

    // Transición de 4 a 5 (Aceptación de horario)
    if (stage === '4' && /dale|perfecto|ok|esa hora|ese horario|me queda bien|confirm/i.test(text.toLowerCase())) {
        if (leadId) {
            await updateLeadState(String(leadId), { ...currentState, stage: '5' });
        }
        return { 
            assistantContext: `ESPERANDO SEÑA (50%) Y WHATSAPP. Recordar al cliente que el turno es pre-reservado hasta recibir el comprobante.`,
            nextStage: '5'
        };
    }

    // Etapa 5 a 6 (Confirmación con pago)
    if (stage === '5' && (!!mediaUrl || /comprobante|transferencia|pago|adjunto/i.test(text.toLowerCase()))) {
        const phoneMatch = text.match(/\d{8,12}/);
        const finalPhone = phoneMatch ? phoneMatch[0] : (currentState.clientPhone || null);

        if (leadId && String(leadId).length > 5) {
            // Crear la cita "fantasma" que el admin confirmará
            await createAppointment(String(leadId), null, new Date().toISOString(), "Servicio Confirmado", 0, 60, []).catch(() => null);
            await updateLeadState(String(leadId), { ...currentState, stage: '6', clientPhone: finalPhone });
            return { 
                assistantContext: `TURNO CONFIRMADO EXITOSAMENTE. Fin del flujo.`,
                nextStage: '6'
            };
        }
    }

    if (stage === '5') {
        return { assistantContext: "SISTEMA: El usuario está en la etapa de pago. Debe enviar el comprobante." };
    }

    return { assistantContext: "SISTEMA: El flujo ha terminado o está esperando una acción de pago." };
}
