import { updateLeadState, getAvailableSlotsFromDB } from '../../_services/db.js';
import type { StageContext } from '../types.js';

export async function handleStage4(ctx: StageContext): Promise<{ assistantContext: string; nextStage?: string }> {
    const { text, leadId, classification, currentState, categories, services } = ctx;
    const { intent, detected_categories = [] } = classification;

    if (intent === 'TURNO' || /turno|cita|agendar|mañana|hoy|lunes|martes|miercoles|jueves|viernes|sabado|domingo/i.test(text)) {
        console.log(`[Stage 4] Consultando disponibilidad`);
        
        const now = new Date();
        let startDate = new Date(now.getTime());
        startDate.setHours(startDate.getHours() + 1); 
        let endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);

        // Si detectamos una fecha específica (ej: mañana), ajustar el rango de búsqueda
        if (classification.detected_date) {
            const requested = new Date(`${classification.detected_date}T00:00:00-03:00`);
            startDate = requested > now ? requested : startDate;
            endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);
        }
        
        let targetCatId = currentState.currentCategoryId;
        
        // Si no hay categoría en el estado, intentar buscar por las categorías del contexto
        if (!targetCatId && detected_categories.length > 0) {
            const found = categories.find(c => 
                detected_categories.some(dc => String(dc).toLowerCase().includes(c.name.toLowerCase()) || String(c.id) === String(dc))
            );
            if (found) targetCatId = String(found.id);
        }

        // Si sigue vacío, buscar la categoría de los servicios seleccionados previamente
        if (!targetCatId && currentState.selectedServiceIds?.length > 0) {
            const firstSvc = services.find(s => String(s.id) === String(currentState.selectedServiceIds[0]));
            if (firstSvc) targetCatId = String(firstSvc.category_id);
        }
        
        if (!targetCatId) {
            return { 
                assistantContext: "SISTEMA: No se pudo determinar el área (categoría) para el turno. Preguntar al usuario qué servicio desea agendar.",
                nextStage: '4'
            };
        }

        const slots = await getAvailableSlotsFromDB(targetCatId, startDate, endDate, 30).catch(() => []);
        
        // Si el cliente pidió una hora específica, verificar si está disponible y capturar el profesional
        const requestedTime = classification.detected_time;
        const matchingSlot = requestedTime && slots.find((s: any) => {
            const d = new Date(s.slot_time);
            const t = d.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false });
            return t === requestedTime;
        });
        const isRequestedAvailable = !!matchingSlot;
        const staffId = matchingSlot ? (matchingSlot.staff_id || matchingSlot.professional_id) : null;

        if (leadId) {
            await updateLeadState(String(leadId), { 
                ...currentState, 
                stage: '4', 
                currentCategoryId: targetCatId,
                pendingDate: classification.detected_date || currentState.pendingDate,
                pendingTime: classification.detected_time || currentState.pendingTime,
                staffId: staffId || currentState.staffId
            });
        }

        if (slots.length > 0) {

            // Formatear slots para la IA forzando zona horaria Argentina
            const formattedSlots = slots.slice(0, 15).map((s: any) => {
                const d = new Date(s.slot_time);
                const timeStr = d.toLocaleTimeString('es-AR', { 
                    timeZone: 'America/Argentina/Buenos_Aires', 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: false 
                });
                const dateStr = d.toLocaleDateString('es-AR', { 
                    timeZone: 'America/Argentina/Buenos_Aires',
                    weekday: 'long', 
                    day: 'numeric' 
                });
                return `${dateStr} a las ${timeStr}hs`;
            }).join(', ');

            return { 
                assistantContext: `SISTEMA: DISPONIBILIDAD REAL (Zona Horaria Argentina): ${formattedSlots}. 
                El cliente preguntó por: "${text}" (${classification.detected_date || 'hoy/mañana'} ${classification.detected_time || ''}). 
                ¿Está disponible lo que pidió?: ${isRequestedAvailable ? 'SÍ, CONFIRMAR' : 'NO, OFRECER ALTERNATIVAS'}.
                Si el cliente pide un horario que ESTÁ en la lista, CONFÍRMALO. Si no está, ofrece alternativas de la lista.`,
                nextStage: '4'
            };
        } else {
            return { 
                assistantContext: `SISTEMA: No hay turnos automáticos en la base de datos para esta área en los próximos 7 días. Pide al usuario un día/hora aproximado para consultar con las especialistas.`,
                nextStage: '4'
            };
        }
    }

    return { assistantContext: "SISTEMA: El usuario está en la etapa de agenda pero no ha solicitado un turno concreto todavía." };
}
