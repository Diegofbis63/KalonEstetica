import { updateLeadState } from '../../_services/db.js';
import type { StageContext } from '../types.js';

export async function handleStage2(ctx: StageContext): Promise<{ assistantContext: string; nextStage?: string }> {
    const { text, leadId, currentState, categories } = ctx;

    console.log(`[Stage 2] Procesando selección de categoría para lead: ${leadId}`);

    // Buscar si el texto menciona alguna categoría
    const detectedCategory = categories.find(cat => 
        text.toLowerCase().includes(cat.name.toLowerCase()) || 
        (cat.slug && text.toLowerCase().includes(cat.slug.toLowerCase()))
    );

    if (detectedCategory) {
        console.log(`[Stage 2] Categoría detectada: ${detectedCategory.name}`);
        
        if (leadId) {
            await updateLeadState(String(leadId), { 
                ...currentState, 
                stage: '3', 
                selectedCategoryId: detectedCategory.id 
            });
        }

        return { 
            assistantContext: `SISTEMA: El cliente eligió la categoría "${detectedCategory.name}". 
            TU MISIÓN: Confirma la elección con elegancia y envía el CATALOGO ESPECÍFICO de esa área (que el sistema procesará ahora). 
            Pregunta qué servicios de esa lista le interesan para armarle el presupuesto.`,
            nextStage: '3'
        };
    }

    return { 
        assistantContext: `SISTEMA: El usuario aún no elige un área clara. 
        TU MISIÓN: Recordale las áreas disponibles (Depilación, Estética Facial, etc.) y pedile que elija una para enviarle los precios.` 
    };
}
