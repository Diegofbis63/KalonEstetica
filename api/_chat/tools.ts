import { tool } from 'ai';
import { z } from 'zod';
import { 
    getCategories, 
    getActiveServices,
    getServicesByCategory, 
    getAvailableSlotsFromDB, 
    updateLeadState,
    createLead
} from '../_services/db.js';
import { matchServicesGreedily } from './utils.js';
import { sql } from '../_services/db.js';
import type { VercelResponse } from '@vercel/node';

export const chatbotTools = (leadId: string | null, currentState: any, res: VercelResponse, identificationId?: string | null) => ({
    registrar_cliente: tool({
        description: 'ETAPA 1 (REGISTRO): Registra al cliente con su nombre y apellido en la base de datos y envía el catálogo principal. Llamá esta herramienta obligatoriamente como tu primera acción cuando el cliente te diga su nombre por primera vez.',
        parameters: z.object({
            nombre_completo: z.string().describe('El nombre y apellido completo del cliente. Capitalizá las primeras letras. Ej: "Selena Ortega"')
        }),
        execute: async ({ nombre_completo }) => {
            console.log('[Tool] Executing registrar_cliente:', nombre_completo);
            try {
                // 1. Crear el lead en la base de datos
                const tempPhone = `anon_${identificationId || Date.now()}`;
                const newLead = await createLead(null, nombre_completo, { 
                    phone: tempPhone, 
                    source: "chatbot", 
                    initId: identificationId || null 
                }) as any;
                
                const newLeadId = newLead?.id || `temp_${Date.now()}`;
                
                // 2. Enviar ID de lead inmediatamente al frontend
                res.write(`data: ${JSON.stringify({ leadId: newLeadId })}\n\n`);
                
                // 3. Enviar imagen del catálogo principal
                const configRows = await sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []);
                const catalogUrl = (configRows as any)?.[0]?.value || 'https://ijltsqfshvunmngvbeue.supabase.co/storage/v1/object/public/kalon-services/CATALOGO%20KALON.png';
                res.write(`data: ${JSON.stringify({ media_url: catalogUrl })}\n\n`);
                
                console.log('[Tool] Registered lead:', newLeadId, 'and sent catalog image.');
                
                return {
                    success: true,
                    leadId: newLeadId,
                    mensaje: `[SISTEMA: El cliente ha sido registrado con éxito en la base de datos con el ID ${newLeadId} y la imagen del catálogo ya fue enviada visualmente. Dale una bienvenida muy cálida por su nombre y pregúntale brevemente qué área o tratamiento le gustaría explorar hoy. Está TERMINANTEMENTE PROHIBIDO listar las categorías principales en texto.]`
                };
            } catch (err: any) {
                console.error('[Tool] Error in registrar_cliente:', err?.message || err);
                return {
                    success: false,
                    error: 'No se pudo registrar el cliente en la base de datos.'
                };
            }
        }
    }),

    obtener_categorias_padre: tool({
        description: 'Obtiene la lista de categorías principales de servicios (ej. Pestañas, Depilación, Masajes). Úsalo obligatoriamente al inicio para enviar el catálogo visual, o cuando el cliente pregunta qué hacen.',
        parameters: z.object({}),
        execute: async () => {
            console.log('[Tool] Executing obtener_categorias_padre');
            const configRows = await sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []);
            const mainImageUrl = configRows?.[0]?.value || 'https://ijltsqfshvunmngvbeue.supabase.co/storage/v1/object/public/kalon-services/CATALOGO%20KALON.png';
            res.write(`data: ${JSON.stringify({ media_url: mainImageUrl })}\n\n`);
            
            const cats = await getCategories();
            return {
                mensaje: "[SISTEMA: La imagen del catálogo principal ya se envió al cliente de forma automática. Está TERMINANTEMENTE PROHIBIDO que enlistes, repitas o menciones estas categorías en tu respuesta de texto. Salúdalo y pregúntale de forma muy breve qué área le gustaría explorar]",
                categorias: cats.map(c => ({ id: c.id, nombre: c.name, descripcion: c.description }))
            };
        }
    }),
    
    obtener_lista_precios_por_categoria: tool({
        description: 'Obtiene los sub-servicios específicos y envía la lista de precios visual (imagen) de una categoría padre. Úsalo SIEMPRE que el cliente elija un área para mostrarle los precios. Si el cliente menciona múltiples categorías (ej. "Depilación y Pestañas"), llama esta herramienta UNA VEZ POR CADA categoría por separado.',
        parameters: z.object({
            categoria_id: z.string().describe('El nombre o ID de la categoría. Podés pasar el nombre en español tal cual lo dijo el cliente (ej. "Depilación", "Pestañas", "Masajes") o el ID obtenido previamente. El sistema buscará la coincidencia automáticamente.')
        }),
        execute: async ({ categoria_id }) => {
            // Primero resolvemos la categoría por nombre o ID usando la búsqueda fuzzy
            const data = await getServicesByCategory(categoria_id);
            if (!data || !data.category) {
                return { error: `Categoría no encontrada para: "${categoria_id}". Pedile al cliente que aclare el nombre.` };
            }
            
            // Usamos el ID real (UUID) para la URL de la imagen
            const realCategoryId = data.category.id;
            const catUrl = `/api/catalog-image?id=${realCategoryId}`;
            res.write(`data: ${JSON.stringify({ media_url: catUrl })}\n\n`);
            
            return {
                mensaje: "[SISTEMA: La imagen con la lista de precios ya se envió al cliente automáticamente. Está TERMINANTEMENTE PROHIBIDO que vuelvas a enlistar o repetir los sub-servicios, precios o duraciones en tu respuesta de texto. Hazle una pregunta muy breve sobre cuál desea agendar]",
                categoria: data.category.name,
                categoria_id_real: realCategoryId,
                sub_servicios: data.services.map(s => ({
                    id: s.id,
                    nombre: s.title,
                    precio: s.price,
                    duracion: s.duration,
                    descripcion: s.description
                }))
            };
        }
    }),

    generar_presupuesto: tool({
        description: 'Calcula el presupuesto de los servicios elegidos por el cliente y lo presenta. Llamá esta herramienta SIEMPRE que el cliente mencione qué servicios quiere (ej: "quiero el cavado completo y laminado de cejas"). NUNCA calcules precios de memoria.',
        parameters: z.object({
            servicios: z.string().describe('Los servicios que pidió el cliente separados por coma. Escribilos tal como los mencionó. Ej: "cavado completo, laminado de cejas"')
        }),
        execute: async ({ servicios }) => {
            console.log('[Tool] Executing generar_presupuesto, servicios:', servicios);
            // 1. Traer todos los servicios activos de la base de datos
            const [allServices, allCategories] = await Promise.all([
                getActiveServices(),
                getCategories()
            ]);
            
            // 2. Fuzzy matching — el campo es una sola string con comas
            const queryText = servicios;
            const matched = matchServicesGreedily(queryText, allServices, allCategories);
            
            if (!matched || matched.length === 0) {
                return {
                    error: 'No encontré esos servicios exactos en la base de datos.',
                    mensaje_para_ia: 'No se encontraron servicios que coincidan. Pedile al cliente que elija de la lista de precios que ya le enviaste.'
                };
            }
            
            // 3. Calcular totales (usando campo 'title' que es el campo correcto en Service)
            const total = matched.reduce((acc: number, s: any) => acc + (Number(s.price) || 0), 0);
            const duration = matched.reduce((acc: number, s: any) => acc + (s.duration_min || 0), 0);
            const sena = Math.round(total / 2);
            
            // 4. Generar imagen de presupuesto via /api/satori-image (aislado para no crashear este módulo)
            const budgetItems = [
                ...matched.map((s: any) => ({ label: s.title, price: Number(s.price) || 0 })),
                { label: 'TOTAL', price: total },
                { label: 'SEÑA REQUERIDA (50%)', price: sena }
            ];
            
            let budgetImageUrl = '';
            
            try {
                console.log('[Tool] Generating budget image locally...');
                const { generateMenuImage } = await import('../_services/imageGenerator.js');
                const imageBuffer = await generateMenuImage('TU PRESUPUESTO KÂLON', budgetItems);
                
                if (imageBuffer) {
                    console.log('[Tool] Budget image generated locally, uploading to Supabase...');
                    // Subir a Supabase
                    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
                        const { createClient } = await import('@supabase/supabase-js');
                        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
                        const fileName = `budget_${leadId || 'anon'}_${Date.now()}.png`;
                        const { data, error } = await supabase.storage
                            .from('kalon-services')
                            .upload(`budgets/${fileName}`, imageBuffer, { contentType: 'image/png', upsert: true });
                        
                        if (data && !error) {
                            budgetImageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/kalon-services/budgets/${fileName}`;
                            res.write(`data: ${JSON.stringify({ media_url: budgetImageUrl })}\n\n`);
                            console.log('[Tool] Budget image generated and sent:', budgetImageUrl);
                        } else {
                            console.warn('[Tool] Supabase upload failed:', error);
                        }
                    }
                } else {
                    console.warn('[Tool] Local image generator returned null');
                }
            } catch (e: any) {
                console.error('[Tool] Error generating budget image locally:', e?.message || e);
                // No re-throw — el presupuesto en texto es un fallback aceptable
            }
            
            // 5. Actualizar estado del lead
            if (leadId) {
                await updateLeadState(leadId, {
                    ...currentState,
                    selectedServiceIds: matched.map((s: any) => String(s.id)),
                    totalPrice: total,
                    totalDuration: duration,
                    budgetImageUrl: budgetImageUrl || currentState.budgetImageUrl,
                    stage: '4'
                });
            }
            
            return {
                mensaje: `[SISTEMA: ${budgetImageUrl ? 'El recibo visual con el presupuesto ya se envió al cliente.' : 'No se pudo generar la imagen del recibo, presentá el presupuesto en texto con los servicios, total y seña.'} La seña requerida es del 50% del total.]`,
                servicios_encontrados: matched.map((s: any) => ({ 
                    id: s.id, 
                    nombre: s.title, 
                    precio: s.price,
                    duracion_minutos: s.duration_min 
                })),
                total_pagar: total,
                sena_requerida: sena,
                duracion_total_minutos: duration,
                imagen_enviada: !!budgetImageUrl
            };
        }
    }),

    consultar_horarios_disponibles: tool({
        description: 'Busca horarios reales disponibles en la agenda de los profesionales para un servicio o categoría y una fecha determinada. Usalo cuando el cliente pregunte por disponibilidad o quiera elegir un horario.',
        parameters: z.object({
            categoria_nombre: z.string().describe('El nombre del servicio o categoría elegida por el cliente (ej. "Pestañas", "laminado de cejas", "Depilación"). El sistema resolverá automáticamente la categoría correcta.'),
            fecha: z.string().describe('Fecha en formato YYYY-MM-DD. Si el cliente dice "hoy", usá la fecha actual real. Si dice "mañana", calculá correctamente. Nunca inventes fechas.'),
            duracion_minutos: z.number().optional().describe('Duración total estimada de los servicios elegidos en minutos. Si no la sabés exactamente, usá 60 como valor por defecto.')
        }),
        execute: async ({ categoria_nombre, fecha, duracion_minutos = 60 }) => {
            try {
                // 1. Resolver la categoría padre por nombre usando fuzzy matching
                const allCategories = await getCategories();
                const normalized = categoria_nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                
                // Buscar la categoría que mejor coincida
                let resolvedCategoryId: string | null = null;
                let resolvedCategoryName: string = categoria_nombre;
                
                for (const cat of allCategories) {
                    const catNorm = cat.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    if (catNorm.includes(normalized) || normalized.includes(catNorm)) {
                        resolvedCategoryId = cat.id;
                        resolvedCategoryName = cat.name;
                        break;
                    }
                }
                
                // Si no encontró por nombre de categoría, buscar por nombre de servicio
                if (!resolvedCategoryId) {
                    const data = await getServicesByCategory(categoria_nombre);
                    if (data?.category) {
                        resolvedCategoryId = data.category.id;
                        resolvedCategoryName = data.category.name;
                    }
                }
                
                // Fallback: Si sigue sin resolverse, usar los servicios pre-seleccionados del estado del lead
                if (!resolvedCategoryId && currentState?.selectedServiceIds && currentState.selectedServiceIds.length > 0) {
                    const allServices = await getActiveServices();
                    const selected = allServices.filter(s => currentState.selectedServiceIds.includes(s.id));
                    if (selected.length > 0) {
                        // Tomamos el servicio con mayor duración para determinar la especialidad de staff
                        const primaryService = selected.sort((a, b) => (b.duration_min || 0) - (a.duration_min || 0))[0];
                        if (primaryService && primaryService.category_id) {
                            resolvedCategoryId = primaryService.category_id;
                            const cat = allCategories.find(c => c.id === resolvedCategoryId);
                            resolvedCategoryName = cat ? cat.name : "Servicio";
                            console.log(`[Tool] Resolved category from currentState.selectedServiceIds: ${resolvedCategoryName} (${resolvedCategoryId})`);
                        }
                    }
                }
                
                if (!resolvedCategoryId) {
                    return { 
                        mensaje: `No pude identificar la categoría para "${categoria_nombre}". Pedile al cliente que confirme qué servicio eligió.`,
                        turnos_disponibles: []
                    };
                }
                
                console.log(`[Tool] Checking slots for category: ${resolvedCategoryName} (${resolvedCategoryId}), date: ${fecha}, duration: ${duracion_minutos}min`);
                
                // 2. Consultar slots disponibles con el UUID correcto
                const startDate = new Date(`${fecha}T00:00:00-03:00`);
                const endDate = new Date(`${fecha}T23:59:59-03:00`);
                const slots = await getAvailableSlotsFromDB(resolvedCategoryId, startDate, endDate, duracion_minutos);
                
                if (!slots || slots.length === 0) {
                    return { 
                        mensaje: `No hay disponibilidad para ${resolvedCategoryName} el ${fecha}. Sugerí otra fecha o consultá si prefiere otro día.`,
                        categoria_resuelta: resolvedCategoryName,
                        turnos_disponibles: []
                    };
                }

                const formatSlot = (s: any) => {
                    const d = new Date(s.slot_time);
                    return {
                        hora: d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
                        staff_id: s.staff_id,
                        iso: s.slot_time
                    };
                };

                return {
                    mensaje: `Horarios disponibles para ${resolvedCategoryName} el ${fecha}`,
                    categoria_resuelta: resolvedCategoryName,
                    categoria_id: resolvedCategoryId,
                    turnos_disponibles: slots.map(formatSlot).slice(0, 10)
                };
            } catch (err: any) {
                console.error('[Tool] consultar_horarios_disponibles error:', err?.message || err);
                return {
                    mensaje: 'Hubo un error al consultar la agenda. Pedile al cliente que reintente.',
                    turnos_disponibles: []
                };
            }
        }
    }),

    pre_reservar_turno: tool({
        description: 'Pre-reserva un turno confirmado por el cliente. Una vez usado, DEBES pedir el número de celular/WhatsApp y el comprobante de pago.',
        parameters: z.object({
            staff_id: z.string().describe('ID del profesional asignado devuelto en consultar_horarios_disponibles'),
            fecha_iso: z.string().describe('Fecha y hora exacta en formato ISO devuelta en consultar_horarios_disponibles'),
            hora_legible: z.string().describe('La hora que el cliente entiende (ej. 16:00)'),
            servicios_elegidos: z.array(z.string()).describe('Lista de nombres de servicios elegidos')
        }),
        execute: async ({ staff_id, fecha_iso, hora_legible, servicios_elegidos }) => {
            const newState = {
                ...currentState,
                staffId: staff_id,
                appointmentDate: fecha_iso.split('T')[0],
                appointmentTime: hora_legible,
                stage: '5' // Forzar stage 5 de cobro (por retrocompatibilidad temporal si es necesario)
            };
            
            if (leadId) {
                await updateLeadState(leadId, newState);
            }
            
            return {
                estado: "PRE_RESERVADO",
                mensaje_para_ia: "El turno fue bloqueado temporalmente. Misión actual: Exigirle al cliente que envíe la foto del comprobante de transferencia por el 50% de seña para confirmar el turno. Si falta su celular, pedíselo también."
            };
        }
    })
});
