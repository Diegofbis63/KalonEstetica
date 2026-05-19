import { updateLeadState } from '../../_services/db.js';
import type { StageContext } from '../types.js';
import { cleanString, detectCategories } from '../utils.js';

export async function handleStage2(ctx: StageContext): Promise<{ assistantContext: string; nextStage?: string }> {
    const { text, leadId, currentState, categories, services } = ctx;

    console.log(`[Stage 2] Procesando selección de categoría(s) para lead: ${leadId}`);

    // 1. Detectar todas las categorías mencionadas (por nombre, slug o servicios contenidos)
    const detectedCategories = detectCategories(text, categories, services, ctx.classification);

    if (detectedCategories.length > 0) {
        console.log(`[Stage 2] Categorías detectadas: ${detectedCategories.map(c => c.name).join(', ')}`);
        
        // Inicializar o recuperar categorías ya enviadas
        const sentCategoryIds = new Set<string>(currentState.sentCategoryIds || []);
        const newlySentCategoryIds: string[] = [];

        // Agregar las imágenes de catálogo de todas las categorías detectadas
        detectedCategories.forEach(cat => {
            if (!sentCategoryIds.has(cat.id)) {
                const url = `/api/catalog-image?id=${cat.id}`;
                console.log(`[Stage 2] Agregando catalog URL para ${cat.name}: ${url}`);
                ctx.mediaUrls.push(url);
                newlySentCategoryIds.push(cat.id);
                sentCategoryIds.add(cat.id);
            } else {
                console.log(`[Stage 2] Catálogo de ${cat.name} ya enviado previamente.`);
            }
        });

        // Determinar si debemos avanzar a Etapa 3 (Presupuesto)
        const cleanedText = cleanString(text);
        const sortedServices = [...services].sort((a, b) => b.title.length - a.title.length);
        const hasServiceReferences = sortedServices.some(svc => {
            const cleanedSvcTitle = cleanString(svc.title);
            if (!cleanedSvcTitle) return false;
            const svcWords = cleanedSvcTitle.split(/\s+/).filter(w => w.length > 3);
            const userWords = cleanedText.split(/\s+/).filter(w => w.length > 3);
            return cleanedText.includes(cleanedSvcTitle) || 
                   (userWords.length > 0 && svcWords.some(w => userWords.includes(w) && w !== 'depilacion' && w !== 'pestanas' && w !== 'pestañas'));
        });

        const isBudgetOrReadyRequest = 
            /presupuesto|precio|cuanto|total|resumen|armame|mostrame los precios|listo|ya esta/i.test(text.toLowerCase()) || 
            hasServiceReferences;

        const advanceToStage3 = isBudgetOrReadyRequest;

        if (leadId) {
            await updateLeadState(String(leadId), { 
                ...currentState, 
                stage: advanceToStage3 ? '3' : '2', 
                sentCategoryIds: Array.from(sentCategoryIds),
                selectedCategoryId: detectedCategories[0].id,
                justSelectedCategoryIds: detectedCategories.map(c => c.id)
            });
        }

        const catNames = detectedCategories.map(c => c.name).join(' y ');

        if (advanceToStage3) {
            console.log(`[Stage 2] Transicionando a Etapa 3. matches services: ${hasServiceReferences}`);
            return {
                assistantContext: `SISTEMA: El cliente ya está listo para presupuestar (eligió áreas y/o mencionó servicios de: ${catNames}). 
                Hemos enviado los catálogos correspondientes. 
                TU MISIÓN: Confirma que ya tenés agendadas estas áreas (${catNames}) y preguntá qué servicios específicos de estas listas le gustaría presupuestar para armar el total.`,
                nextStage: '3'
            };
        } else {
            console.log(`[Stage 2] Permaneciendo en Etapa 2 para acumular categorías.`);
            const newlySentNames = detectedCategories.filter(c => newlySentCategoryIds.includes(c.id)).map(c => c.name).join(' y ');
            
            return {
                assistantContext: `SISTEMA: Enviaste el catálogo de: ${newlySentNames || catNames}. 
                El cliente sigue en ETAPA 2 (Catálogo).
                TU MISIÓN: Saludá con calidez cordobesa, confirmá el envío de los catálogos y preguntá si le gustaría ver alguna otra área de estética (ej. Pestañas, Facial, Reiki, etc.) o si ya pasamos a presupuestar sus servicios de ${catNames}.`,
                nextStage: '2'
            };
        }
    }

    return { 
        assistantContext: `SISTEMA: El usuario aún no elige un área clara. 
        TU MISIÓN: Recordale las áreas disponibles (Depilación, Estética Facial, Pestañas, Reiki, etc.) y pedile que elija una para enviarle los precios.` 
    };
}

