import { updateLeadState, getAvailableSlotsFromDB } from '../../_services/db.js';
import type { StageContext } from '../types';

export async function handleStage4(ctx: StageContext): Promise<{ assistantContext: string; nextStage?: string }> {
    const { text, leadId, classification, currentState } = ctx;
    const { intent, detected_categories = [] } = classification;

    if (intent === 'TURNO' || /turno|cita|agendar/i.test(text)) {
        console.log(`[Stage 4] Consultando disponibilidad`);
        
        const now = new Date();
        const startDate = new Date(now.getTime());
        startDate.setHours(startDate.getHours() + 2); 
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);
        
        let targetCatId = detected_categories[0] || currentState.currentCategoryId || '';
        
        // Si no hay categoría detectada, intentar inferir del estado anterior
        const slots = targetCatId ? await getAvailableSlotsFromDB(targetCatId, startDate, endDate, 30).catch(() => []) : [];
        
        if (leadId) {
            await updateLeadState(String(leadId), { ...currentState, stage: '4' });
        }

        if (slots.length > 0) {
            return { 
                assistantContext: `DISPONIBILIDAD PARA ${targetCatId}: Encontrados ${slots.length} turnos. Ofrecer 3 opciones claras.`,
                nextStage: '4'
            };
        } else {
            return { 
                assistantContext: `SIN SLOTS EN DB. Pedir al usuario que sugiera día y hora para consultar manualmente.`,
                nextStage: '4'
            };
        }
    }

    return { assistantContext: "SISTEMA: El usuario está en la etapa de agenda pero no ha solicitado un turno concreto todavía." };
}
