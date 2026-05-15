import { updateLeadState, sql } from '../../_services/db.js';
import type { StageContext } from '../types';

export async function handleStage2And3(ctx: StageContext): Promise<{ assistantContext: string; nextStage?: string }> {
    const { text, leadId, classification, categories, services, currentState } = ctx;
    const { intent, detected_categories = [] } = classification;

    // === FALLBACK DE CATEGORÍA POR KEYWORD ===
    const effectiveCatIds = [...detected_categories];
    const userNorm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    if (effectiveCatIds.length === 0) {
        for (const cat of categories) {
            const catNorm = cat.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const catWords = catNorm.split(/\s+/).filter((w: string) => w.length > 3);
            if (userNorm.includes(catNorm) || catWords.some((w: string) => userNorm.includes(w))) {
                effectiveCatIds.push(String(cat.id));
            }
        }
    }

    if (intent === 'CONSULTA_SERVICIO' || effectiveCatIds.length > 0) {
        console.log(`[Stage 2/3] Procesando consulta de servicios: ${effectiveCatIds.join(',')}`);
        
        const allServices = await sql`SELECT s.id, s.title, s.price, s.category_id, c.name as category_name 
            FROM services s LEFT JOIN categories c ON s.category_id = c.id 
            WHERE s.active = true`.catch(() => []);
        
        const matchedServices = allServices.filter((s: any) => {
            const t = (s.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return userNorm.includes(t) || t.includes(userNorm) || effectiveCatIds.includes(String(s.category_id));
        });

        if (matchedServices.length > 0) {
            const receiptItems = matchedServices.slice(0, 8).map((s: any) => ({ 
                label: s.title, 
                price: `$${Number(s.price).toLocaleString('es-AR')}` 
            }));
            const totalPrice = matchedServices.reduce((acc: number, s: any) => acc + Number(s.price), 0);
            receiptItems.push({ label: 'TOTAL ESTIMADO', price: `$${totalPrice.toLocaleString('es-AR')}` });
            
            const satoriData = Buffer.from(JSON.stringify(receiptItems)).toString('base64');
            const receiptUrl = `https://kalon-estetica.vercel.app/api/satori-image?title=${encodeURIComponent('TU PRESUPUESTO KÂLON')}&data=${satoriData}`;
            
            ctx.mediaUrls.push(receiptUrl);
            
            if (leadId) {
                await updateLeadState(String(leadId), { 
                    ...currentState, 
                    stage: '3', 
                    selectedServiceIds: matchedServices.map((s: any) => String(s.id)) 
                });
                return { 
                    assistantContext: `PRESUPUESTO GENERADO para: ${matchedServices.map((s: any) => s.title).join(', ')}.`,
                    nextStage: '3'
                };
            }
        } else {
            // Si no hay servicios específicos, enviar el catálogo de la categoría
            const matchedCats = categories.filter(c => effectiveCatIds.includes(String(c.id)));
            let sentCatalog = false;
            for (const cat of matchedCats) {
                if (cat.price_list_url) {
                    ctx.mediaUrls.push(cat.price_list_url);
                    sentCatalog = true;
                }
            }
            
            if (sentCatalog) {
                if (leadId) await updateLeadState(String(leadId), { ...currentState, stage: '2' });
                return { 
                    assistantContext: `SISTEMA: Se enviaron los catálogos de área solicitados.`,
                    nextStage: '2'
                };
            }
        }
    }

    return { assistantContext: "SISTEMA: El usuario está en la etapa de catálogo/presupuesto pero no ha especificado un servicio claro." };
}
