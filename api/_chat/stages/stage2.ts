import { updateLeadState } from '../../_services/db.js';
import type { StageContext } from '../types.js';

export async function handleStage2(ctx: StageContext): Promise<{ assistantContext: string; nextStage?: string }> {
    const { text, leadId, currentState, categories } = ctx;

    console.log(`[Stage 2] Procesando selección de categoría(s) para lead: ${leadId}`);

    // Buscar TODAS las categorías mencionadas (usando el texto y la clasificación de la IA)
    const detectedCategories = categories.filter(cat => 
        text.toLowerCase().includes(cat.name.toLowerCase()) || 
        (cat.slug && text.toLowerCase().includes(cat.slug.toLowerCase())) ||
        ctx.classification.detected_categories?.some(dc => dc.toLowerCase().includes(cat.name.toLowerCase()) || cat.name.toLowerCase().includes(dc.toLowerCase()))
    );

    if (detectedCategories.length > 0) {
        console.log(`[Stage 2] Categorías detectadas: ${detectedCategories.map(c => c.name).join(', ')}`);
        
        // Agregar las imágenes de catálogo de todas las categorías detectadas
        detectedCategories.forEach(cat => {
            if (cat.image_url) ctx.mediaUrls.push(cat.image_url);
        });

        if (leadId) {
            await updateLeadState(String(leadId), { 
                ...currentState, 
                stage: '3', 
                selectedCategoryId: detectedCategories[0].id, // Guardamos la primera como referencia principal
                justSelectedCategoryIds: detectedCategories.map(c => c.id)
            });
        }

        const catNames = detectedCategories.map(c => c.name).join(' y ');
        return { 
            assistantContext: `SISTEMA: El cliente mostró interés en: ${catNames}. 
            Se han enviado los catálogos de esas áreas. 
            TU MISIÓN: Confirma que recibiste su pedido para esas áreas y preguntá qué servicios específicos de las listas le interesan para armarle el presupuesto total.`,
            nextStage: '3'
        };
    }


    return { 
        assistantContext: `SISTEMA: El usuario aún no elige un área clara. 
        TU MISIÓN: Recordale las áreas disponibles (Depilación, Estética Facial, etc.) y pedile que elija una para enviarle los precios.` 
    };
}
