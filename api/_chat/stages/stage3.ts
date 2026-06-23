import { updateLeadState } from '../../_services/db.js';
import { generateMenuImage } from '../../_services/imageGenerator.js';
import { createClient } from '@supabase/supabase-js';
import type { StageContext, Service } from '../types.js';
import { cleanString, matchServicesGreedily, detectCategories } from '../utils.js';

export async function handleStage3(ctx: StageContext): Promise<{ assistantContext: string; nextStage?: string }> {
    const { text, leadId, currentState, services, categories } = ctx;
    const lowText = text.toLowerCase();

    console.log(`[Stage 3] Analizando pedido: "${text}"`);

    // 1. Algoritmo de Matching Robusto usando utilidades limpias y emparejamiento codicioso
    const newMatches: Service[] = matchServicesGreedily(text, services, categories);
    const currentServiceIds = new Set(currentState.selectedServiceIds?.map(String) || []);

    if (newMatches.length > 0) {
        newMatches.forEach(svc => {
            currentServiceIds.add(String(svc.id));
        });
    }

    // 2. Si hay servicios seleccionados, actualizar presupuesto
    if (currentServiceIds.size > 0) {
        const allSelectedServices = services.filter(s => currentServiceIds.has(String(s.id)));
        const total = allSelectedServices.reduce((acc, s) => acc + (Number(s.price) || 0), 0);
        const duration = allSelectedServices.reduce((acc, s) => acc + (s.duration_min || 0), 0);
        
        // A. Inyectar catálogos que falten y no se hayan enviado
        const sentCategoryIds = new Set<string>(currentState.sentCategoryIds || []);
        const newlySentCategoryIds: string[] = [];

        for (const svc of allSelectedServices) {
            if (svc.category_id && !sentCategoryIds.has(svc.category_id)) {
                const cat = categories.find(c => c.id === svc.category_id);
                if (cat) {
                    const url = `/api/catalog-image?id=${cat.id}`;
                    console.log(`[Stage 3] Injecting missing catalog image for ${cat.name}: ${url}`);
                    ctx.mediaUrls.push(url);
                    newlySentCategoryIds.push(svc.category_id);
                    sentCategoryIds.add(svc.category_id);
                }
            }
        }

        // B. Generar Imagen de Presupuesto
        const budgetItems = allSelectedServices.map(m => ({ label: m.title, price: Number(m.price) || 0 }));
        budgetItems.push({ label: 'TOTAL ACUMULADO', price: total });

        let budgetImageUrl = '';
        let isTextOnlyBudget = false;

        const imageBuffer = await generateMenuImage('TU PRESUPUESTO KÂLON', budgetItems);
        
        if (imageBuffer && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
            try {
                const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
                const fileName = `budget_${leadId}_${Date.now()}.png`;
                const { data, error } = await supabase.storage
                    .from('kalon-services')
                    .upload(`budgets/${fileName}`, imageBuffer, { contentType: 'image/png' });
                
                if (data && !error) {
                    budgetImageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/kalon-services/budgets/${fileName}`;
                    ctx.mediaUrls.push(budgetImageUrl);
                } else {
                    console.warn('[Stage 3] Supabase upload failed, falling back to text budget', error);
                    isTextOnlyBudget = true;
                }
            } catch (e) {
                console.error('[Stage 3] Error during Supabase upload:', e);
                isTextOnlyBudget = true;
            }
        } else {
            isTextOnlyBudget = true;
        }

        if (leadId) {
            await updateLeadState(String(leadId), { 
                ...currentState, 
                selectedServiceIds: Array.from(currentServiceIds),
                sentCategoryIds: Array.from(sentCategoryIds),
                totalPrice: total,
                totalDuration: duration,
                budgetImageUrl: budgetImageUrl || currentState.budgetImageUrl
            });
        }

        const formattedServicesList = allSelectedServices.map(m => `✨ *${m.title}* - $${m.price}`).join('\n');
        const budgetTextFallback = `\n\n🧾 *PRESUPUESTO ACUMULADO:* \n${formattedServicesList}\n\n💰 *TOTAL: $${total}* (${duration} min)`;

        const missingCatalogsContext = newlySentCategoryIds.length > 0 
            ? ` (además, le inyectamos los catálogos correspondientes a los servicios solicitados que no había visto)`
            : '';

        return { 
            assistantContext: `SISTEMA: El cliente agregó servicios al presupuesto${missingCatalogsContext}. 
            Servicios en total: ${allSelectedServices.map(m => m.title).join(", ")}. 
            Total: $${total}.
            ${isTextOnlyBudget ? `Muestra este presupuesto por texto formateado en tu respuesta: ${budgetTextFallback}` : 'Se ha enviado la imagen del presupuesto.'}
            TU MISIÓN: Confirma los servicios que tiene sumados actualmente con calidez, detalla el total y preguntá amablemente: "¿Sumamos algo más o pasamos a elegir el turno?"`,
        };
    }

    // 3. Salto a etapa 4 si confirma
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

    // 2.5. Intercept general category keywords in Stage 3 to guide the client
    const detectedCats = detectCategories(text, categories, services);
    if (detectedCats.length > 0) {
        const firstCat = detectedCats[0];
        const catServices = services.filter(s => s.category_id === firstCat.id && s.active);
        const servicesListText = catServices.map(s => `✨ *${s.title}* - $${Number(s.price).toLocaleString('es-AR')}`).join('\n');
        
        // Inject catalog image automatically
        const url = firstCat.price_list_url || `/api/catalog-image?id=${firstCat.id}`;
        console.log(`[Stage 3] Category query detected for: "${firstCat.name}". Injecting catalog: ${url}`);
        ctx.mediaUrls.push(url);
        
        // Keep in stage 3, but set current category to track
        if (leadId) {
            await updateLeadState(String(leadId), {
                ...currentState,
                currentCategoryId: firstCat.id
            });
        }
        
        return {
            assistantContext: `SISTEMA: El cliente solicitó la categoría "${firstCat.name}" (o un sinónimo). Le enviamos automáticamente la imagen del catálogo de precios de esa sección.
            Servicios disponibles en la categoría:
            ${servicesListText}
            TU MISIÓN: Dile amablemente al cliente que le enviaste la lista de precios de la sección "${firstCat.name}" y pregúntale cuál o cuáles de los servicios que se ven en la imagen le gustaría agendar.`
        };
    }

    return { 
        assistantContext: `SISTEMA: El usuario pidió algo que no encontré en la base de datos de servicios.
        TU MISIÓN: Sé sumamente amable y de manera muy cálida y atenta, decile al cliente que no encontraste exactamente esa opción en tu lista, e invitala a ver el catálogo de precios enviado para elegir el servicio exacto de la lista.` 
    };
}
