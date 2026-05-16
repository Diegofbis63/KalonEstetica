import { updateLeadState, sql } from '../../_services/db.js';
import { generateMenuImage } from '../../_services/imageGenerator.js';
import { createClient } from '@supabase/supabase-js';
import type { StageContext, Service } from '../types.js';

export async function handleStage3(ctx: StageContext): Promise<{ assistantContext: string; nextStage?: string }> {
    const { text, leadId, currentState, services } = ctx;
    const lowText = text.toLowerCase();
    
    // Lazy Supabase init to prevent top-level crashes
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('[Stage 3] CRITICAL: Missing Supabase credentials');
        return { assistantContext: "SISTEMA: Error de configuración (Supabase). TU MISIÓN: Pide disculpas y di que el sistema de presupuestos está en mantenimiento." };
    }
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);


    console.log(`[Stage 3] Analizando pedido: "${text}"`);

    // 1. Filtrar servicios por categoría si ya eligió una, sino buscar en todos
    const availableServices = services.filter(s => 
        !currentState.selectedCategoryId || s.category_id === currentState.selectedCategoryId
    );

    // 2. Algoritmo de Matching Robusto
    let remainingText = lowText;
    const newMatches: Service[] = [];
    const currentServiceIds = new Set(currentState.selectedServiceIds?.map(String) || []);

    const sortedByLength = [...services].sort((a, b) => b.title.length - a.title.length);

    for (const service of sortedByLength) {
        const title = service.title.toLowerCase();
        if (remainingText.includes(title) || (remainingText.length > 5 && title.includes(remainingText))) {
            if (!currentServiceIds.has(String(service.id))) {
                newMatches.push(service);
                currentServiceIds.add(String(service.id));
                remainingText = remainingText.replace(title, "").trim();
            }
        }
    }

    // 3. Si encontramos nuevos servicios, actualizar lista acumulada
    if (newMatches.length > 0) {
        const allSelectedServices = services.filter(s => currentServiceIds.has(String(s.id)));
        const total = allSelectedServices.reduce((acc, s) => acc + (Number(s.price) || 0), 0);
        const duration = allSelectedServices.reduce((acc, s) => acc + (s.duration_min || 0), 0);
        
        // Generar Imagen de Presupuesto Actualizado
        const budgetItems = allSelectedServices.map(m => ({ label: m.title, price: m.price || 0 }));
        budgetItems.push({ label: 'TOTAL ACUMULADO', price: total });

        const imageBuffer = await generateMenuImage('TU PRESUPUESTO KÂLON', budgetItems);
        let budgetImageUrl = '';

        if (imageBuffer) {
            const fileName = `budget_${leadId}_${Date.now()}.png`;
            const { data } = await supabase.storage
                .from('kalon-services')
                .upload(`budgets/${fileName}`, imageBuffer, { contentType: 'image/png' });
            
            if (data) {
                budgetImageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/kalon-services/budgets/${fileName}`;
                ctx.mediaUrls.push(budgetImageUrl);
            }
        }

        if (leadId) {
            await updateLeadState(String(leadId), { 
                ...currentState, 
                selectedServiceIds: Array.from(currentServiceIds),
                totalPrice: total,
                totalDuration: duration,
                budgetImageUrl
            });
        }

        return { 
            assistantContext: `SISTEMA: Agregué ${newMatches.map(m => m.title).join(", ")} al presupuesto. 
            Lista actual: ${allSelectedServices.map(m => m.title).join(", ")}. 
            Total: $${total}.
            TU MISIÓN: Confirmá que los agregaste y preguntá: "¿Querés sumar algún otro servicio o ya buscamos un turno para esto?"`,
        };
    }

    // 4. Salto a etapa 4 si confirma
    if (/agendar|turno|cita|si|sí|dale|perfecto|me gusta|reservar/i.test(lowText) && (currentState.selectedServiceIds?.length || 0) > 0) {
        if (leadId) {
            await updateLeadState(String(leadId), { ...currentState, stage: '4' });
        }
        return { 
            assistantContext: `SISTEMA: El cliente aceptó el presupuesto. Pasamos a ETAPA 4 (Agenda).
            TU MISIÓN: Indica que vas a revisar la disponibilidad y preguntá qué día/horario le queda mejor.`,
            nextStage: '4'
        };
    }

    return { 
        assistantContext: `SISTEMA: El usuario pidió algo que no encontré en la base de datos.
        TU MISIÓN: Sé amable, decile que no encontraste exactamente eso en el catálogo y pedile que te confirme qué servicio de la lista le interesa para presupuestar.` 
    };
}
