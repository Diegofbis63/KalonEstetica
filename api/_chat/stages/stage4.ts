import { updateLeadState, getAvailableSlotsFromDB } from '../../_services/db.js';
import type { StageContext } from '../types.js';

export async function handleStage4(ctx: StageContext): Promise<{ assistantContext: string; nextStage?: string }> {
    const { text, leadId, classification, currentState, categories, services } = ctx;
    const { intent, detected_date, detected_time } = classification;

    console.log(`[Stage 4] Analizando Agenda. Fecha Detectada: ${detected_date}, Hora: ${detected_time}`);

    // 1. Determinar Categoría (Prioridad: Servicios seleccionados > Categoría actual)
    let targetCatId = currentState.selectedCategoryId;
    if (!targetCatId && currentState.selectedServiceIds?.length > 0) {
        const firstSvc = services.find(s => String(s.id) === String(currentState.selectedServiceIds[0]));
        if (firstSvc) targetCatId = firstSvc.category_id;
    }

    if (!targetCatId) {
        return { 
            assistantContext: "SISTEMA: No sé para qué área es el turno. Preguntale al cliente para qué servicio o área desea agendar.",
            nextStage: '4'
        };
    }

    // 2. Rango de Fechas (Argentina UTC-3)
    let startDate: Date;
    let endDate: Date;

    if (detected_date) {
        startDate = new Date(`${detected_date}T00:00:00-03:00`);
        endDate = new Date(`${detected_date}T23:59:59-03:00`);
    } else {
        // Por defecto: hoy y los próximos 7 días
        const now = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Argentina/Buenos_Aires"}));
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    // 3. Consultar Disponibilidad Real
    const slots = await getAvailableSlotsFromDB(String(targetCatId), startDate, endDate, currentState.totalDuration || 30).catch(() => []);
    
    if (slots.length === 0) {
        return { 
            assistantContext: `SISTEMA: No hay disponibilidad para el área ${targetCatId} en la fecha solicitada. 
            TU MISION: Informá con calidez que no hay turnos libres para ese día y sugerí consultar para otro día de la semana.`,
            nextStage: '4'
        };
    }

    // 4. Clasificación por Periodos (Mañana, Tarde, Noche)
    const mappedSlots = slots.map((s: any) => {
        const d = new Date(s.slot_time);
        const hour = d.getHours(); // Local hour
        const timeStr = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        let period: 'MAÑANA' | 'TARDE' | 'NOCHE' = 'MAÑANA';
        if (hour >= 13 && hour < 17) period = 'TARDE';
        if (hour >= 17) period = 'NOCHE';

        return { 
            time: timeStr, 
            fullDate: d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }),
            isoDate: d.toISOString().split('T')[0],
            staffId: s.staff_id,
            period 
        };
    });

    // 5. Match Exacto o Sugerencia Triple
    const exactMatch = detected_time ? mappedSlots.find(s => s.time.startsWith(detected_time.substring(0, 2))) : null;

    if (exactMatch) {
        if (leadId) {
            await updateLeadState(String(leadId), { 
                ...currentState, 
                staffId: String(exactMatch.staffId),
                appointmentDate: exactMatch.isoDate,
                appointmentTime: exactMatch.time
            });
        }
        return { 
            assistantContext: `SISTEMA: El horario ${exactMatch.time} está DISPONIBLE. 
            TU MISION: Confirmá este horario específico con entusiasmo y preguntá si desea reservarlo.`,
            nextStage: '4'
        };
    }

    // Seleccionar 3 opciones únicas por periodo
    const suggestions: any[] = [];
    ['MAÑANA', 'TARDE', 'NOCHE'].forEach(p => {
        const slot = mappedSlots.find(s => s.period === p && !suggestions.find(already => already.time === s.time));
        if (slot) suggestions.push(slot);
    });

    // Rellenar hasta 3 si faltan periodos
    if (suggestions.length < 3) {
        mappedSlots.forEach(s => {
            if (suggestions.length < 3 && !suggestions.find(already => already.time === s.time)) suggestions.push(s);
        });
    }

    const optionsText = suggestions.map(s => `- ${s.period}: ${s.time} (${s.fullDate})`).join('\n');

    return { 
        assistantContext: `SISTEMA: No encontré el horario exacto, pero hay estos 3 disponibles (Y SOLO ESTOS 3):
        ${optionsText}
        TU MISION: Ofrecé EXACTAMENTE estas 3 opciones categorizadas. Prohibido inventar otros horarios.`,
        nextStage: '4'
    };
}
