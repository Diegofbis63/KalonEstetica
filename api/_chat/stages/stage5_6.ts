import { updateLeadState, createAppointment } from '../../_services/db.js';
import type { StageContext } from '../types.js';

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
            console.log(`[Stage 5-6] Finalizing appointment for Lead: ${leadId}. Media: ${!!mediaUrl}`);
            
            const appointmentDate = currentState.pendingDate && currentState.pendingTime 
                ? `${currentState.pendingDate}T${currentState.pendingTime}:00-03:00`
                : new Date().toISOString();

            // Usar datos reales del estado
            const price = currentState.totalPrice || 0;
            const duration = currentState.totalDuration || 60;

            await createAppointment(
                String(leadId), 
                null, 
                appointmentDate, 
                "Servicio Kalon", 
                price, 
                duration, 
                [], 
                currentState.staffId || null
            ).catch(e => console.error("Error creating appointment:", e));

            await updateLeadState(String(leadId), { 
                ...currentState, 
                stage: '6', 
                clientPhone: finalPhone,
                status: 'paid' 
            });

            return { 
                assistantContext: `TURNO CONFIRMADO EXITOSAMENTE. El comprobante fue recibido (${mediaUrl || 'por texto'}). Fin del flujo. Saludar y cerrar.`,
                nextStage: '6'
            };
        }
    }

    if (stage === '5') {
        return { assistantContext: "SISTEMA: El usuario está en la etapa de pago. Debe enviar el comprobante." };
    }

    return { assistantContext: "SISTEMA: El flujo ha terminado o está esperando una acción de pago." };
}
