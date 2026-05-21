import { updateLeadState, createAppointment } from '../../_services/db.js';
import type { StageContext, Service } from '../types.js';

export async function handleStage6(ctx: StageContext): Promise<{ assistantContext: string; nextStage?: string }> {
    const { leadId, currentState, services } = ctx;

    console.log(`[Stage 6] Ejecutando confirmación final en DB para lead: ${leadId}`);

    if (leadId) {
        // Evitar duplicados si ya tiene cita
        if (currentState.appointmentId && currentState.status === 'paid') {
            return { assistantContext: "SISTEMA: El turno ya fue confirmado. Despedida boutique final." };
        }

        const date = currentState.appointmentDate;
        const time = currentState.appointmentTime;
        
        if (!date || !time) {
            return { 
                assistantContext: "SISTEMA: Error crítico, se perdió la fecha/hora. Pedir reconfirmar horario.",
                nextStage: '4'
            };
        }

        const appointmentDateStr = `${date}T${time}:00-03:00`;
        const price = Number(currentState.totalPrice) || 0;
        const duration = Number(currentState.totalDuration) || 60;
        
        const selectedServices: Service[] = (currentState.selectedServiceIds || [])
            .map(id => services.find(s => String(s.id) === String(id)))
            .filter(Boolean) as Service[];

        try {
            const newApp = await createAppointment(
                String(leadId), 
                null, 
                appointmentDateStr, 
                selectedServices.map(s => s.title).join(', ') || "Reserva Chatbot", 
                price, 
                duration, 
                selectedServices, 
                currentState.staffId || null
            );

            await updateLeadState(String(leadId), { 
                ...currentState, 
                stage: '6', 
                status: 'paid',
                appointmentId: (newApp as any)?.id || 'confirmed'
            });

            return { 
                assistantContext: `SISTEMA: TURNO GRABADO EN DB EXITOSAMENTE para el ${date} a las ${time}. 
                MISION: Felicita al cliente con calidez boutique cordobesa y dale la bienvenida a Kâlon. Fin del flujo.`,
                nextStage: '6'
            };
        } catch (e) {
            console.error("[Stage 6] Error fatal al crear cita:", e);
            return { assistantContext: "SISTEMA: Error al grabar en DB. Informá al cliente que hubo un problema técnico y que Gabriela lo contactará pronto." };
        }
    }

    return { assistantContext: "SISTEMA: Estado desconocido en Etapa 6." };
}
