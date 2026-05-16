import { updateLeadState, sql } from '../../_services/db.js';
import type { StageContext } from '../types.js';

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
        console.log(`[Stage 2/3] Procesando consulta: cats_in=${effectiveCatIds.join(',')}`);
        
        // 1. BUSCAR SERVICIOS ESPECÍFICOS PRIMERO (INTENTO DE ETAPA 3)
        const allServices = await sql`SELECT s.id, s.title, s.price, s.category_id 
            FROM services s WHERE s.active = true`.catch(() => []);
        
        const matchedServices = allServices.filter((s: any) => {
            const t = (s.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            // Match más flexible: si el usuario menciona partes del título
            return userNorm.includes(t) && t.length > 3;
        });

        if (matchedServices.length > 0) {
            console.log(`[Stage 2/3] Servicios matcheados: ${matchedServices.map(s => s.title).join(', ')}`);
            const receiptItems = matchedServices.slice(0, 8).map((s: any) => ({ 
                label: s.title, 
                price: `$${Number(s.price).toLocaleString('es-AR')}` 
            }));
            const totalPrice = matchedServices.reduce((acc: number, s: any) => acc + Number(s.price), 0);
            const totalDuration = matchedServices.reduce((acc: number, s: any) => acc + (parseInt(String(s.duration_min)) || 30), 0);
            receiptItems.push({ label: 'TOTAL ESTIMADO', price: `$${totalPrice.toLocaleString('es-AR')}` });
            
            const satoriData = Buffer.from(JSON.stringify(receiptItems)).toString('base64');
            const receiptUrl = `https://kalon-estetica.vercel.app/api/satori-image?title=${encodeURIComponent('TU PRESUPUESTO KÂLON')}&data=${satoriData}`;
            
            ctx.mediaUrls.push(receiptUrl);
            
            if (leadId) {
                const categoryId = matchedServices[0]?.category_id;
                await updateLeadState(String(leadId), { 
                    ...currentState, 
                    stage: '3', 
                    selectedServiceIds: matchedServices.map((s: any) => String(s.id)),
                    currentCategoryId: categoryId ? String(categoryId) : currentState.currentCategoryId,
                    totalPrice: totalPrice,
                    totalDuration: totalDuration
                });
                return { 
                    assistantContext: `SISTEMA: PRESUPUESTO GENERADO con los servicios: ${matchedServices.map((s: any) => s.title).join(', ')}. El total es $${totalPrice.toLocaleString('es-AR')}.`,
                    nextStage: '3'
                };
            }
        }

        // 2. SI NO HAY SERVICIOS, RESOLVER CATEGORÍAS (ETAPA 2)
        const matchedCats = categories.filter(c => {
            const catIdStr = String(c.id);
            const catNameNorm = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            
            return effectiveCatIds.some(input => {
                const inputStr = String(input);
                const inputNorm = inputStr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                return inputStr === catIdStr || inputNorm === catNameNorm || catNameNorm.includes(inputNorm);
            });
        });

        let sentCategoryCatalog = false;
        for (const cat of matchedCats) {
            if (cat.price_list_url) {
                ctx.mediaUrls.push(cat.price_list_url);
                sentCategoryCatalog = true;
            }
        }

        if (sentCategoryCatalog) {
            if (leadId) await updateLeadState(String(leadId), { ...currentState, stage: '2' });
            return { 
                assistantContext: `SISTEMA: Se enviaron las imágenes de catálogo existentes para las áreas: ${matchedCats.map(c => c.name).join(', ')}.`,
                nextStage: '2'
            };
        }
    }

    return { assistantContext: "SISTEMA: El usuario está en la etapa de catálogo/presupuesto pero no ha especificado un servicio claro." };
}
