import { tool } from 'ai';
import { z } from 'zod';
import { 
    getCategories,
    getActiveServices,
    getAvailableSlotsFromDB, 
    getStaffByCategory,
    createLead,
    type ContactInfo,
    createAppointment,
    getServicesByCategory,
    getAllStaff,
    db,
    schema
} from './db.js';
import { eq } from 'drizzle-orm';

/**
 * Herramientas del Chatbot KÂLON.
 * 
 * Utiliza un patrón de cierre para mantener el leadId durante la sesión de stream.
 */
export const buildTools = (initialLeadId: string | null, orgId: string | null, initId?: string | null) => {
    let currentLeadId = initialLeadId;

    return {
        registrar_cliente: tool({
            description: 'Registra un nuevo cliente en KÂLON. Usalo cuando el cliente te diga su nombre y apellido.',
            parameters: z.object({
                nombre: z.string().describe('Nombre de pila del cliente'),
                apellido: z.string().describe('Apellido del cliente'),
            }),
            execute: async ({ nombre, apellido }: { nombre: string; apellido: string }) => {
                try {
                    const fullName = `${nombre} ${apellido}`.trim();
                    const contactInfo: ContactInfo = { 
                        phone: "Sin teléfono", 
                        source: "web_chatbot",
                        initId: initId || null
                    };
                    const newLead = await createLead(orgId, fullName, contactInfo) as any;
                    
                    if (!newLead) {
                        return { success: false, error: 'Hubo un problemita guardando tus datos. ¿Podrías decirme tu nombre de nuevo? ✨' };
                    }

                    currentLeadId = newLead.id; 
                    return { 
                        success: true, 
                        leadId: newLead.id, 
                        nombre: fullName,
                        result: "CLIENTE_REGISTRADO_EXITOSAMENTE"
                    };
                } catch (err) {
                    console.error('[Tool:registrar_cliente] ERROR:', err);
                    return { success: false, error: 'No se pudo registrar al cliente por un error técnico. Intentá de nuevo.' };
                }
            }
        }),

        listar_categorias_principales: tool({
            description: 'Lista las categorías principales de servicios. REQUIERE IDENTIFICACIÓN PREVIA.',
            parameters: z.object({}),
            execute: async () => {
                if (!currentLeadId) {
                    return { error: 'Primero necesito tu nombre y apellido para poder mostrarte nuestras especialidades.' };
                }
                try {
                    const categories = await getCategories();
                    console.log(`[Tool:listar_categorias] ${categories.length} categorías encontradas`);
                    return categories.map((c, i) => ({
                        numero: i + 1,
                        nombre: c.name,
                        id: c.id,
                        error: null as string | null
                    }));
                } catch (err) {
                    console.error('[Tool:listar_categorias] ERROR:', err);
                    return [{ numero: 0, nombre: null, id: null, error: 'No se pudieron cargar las categorías.' }];
                }
            }
        }),

        consultar_servicios: tool({
            description: 'Muestra los servicios específicos con precios dentro de una categoría. REQUIERE IDENTIFICACIÓN PREVIA.',
            parameters: z.object({
                categoriaNombre: z.string().describe('Nombre de la categoría (ej: "Depilación", "Pestañas"). También acepta UUID.')
            }),
            execute: async ({ categoriaNombre }: { categoriaNombre: string }) => {
                if (!currentLeadId) {
                    return { success: false, error: 'Primero necesito tu nombre y apellido para poder mostrarte los servicios.', servicios: [] };
                }
                try {
                    const { services, category } = await getServicesByCategory(categoriaNombre);
                    
                    if (services.length === 0) {
                        const categories = await getCategories();
                        console.warn(`[TOOL CRITICAL] No match for category: "${categoriaNombre}"`);
                        return { 
                            success: false,
                            error: `No encontré la categoría "${categoriaNombre}".`, 
                            categorias_disponibles: categories.map((c, i) => `${i+1}. ${c.name}`).join(', '),
                            servicios: []
                        };
                    }

                    console.log(`[TOOL CRITICAL] Found ${services.length} services for ${categoriaNombre}`);
                    return {
                        success: true,
                        servicios: services.map(s => ({
                            label: s.title || "Servicio",
                            price: s.price || 0,
                            id: s.id,
                            category: s.category_name || "Servicios"
                        })),
                        price_list_url: category?.price_list_url || null,
                        error: null as string | null,
                        categorias_disponibles: null as string | null
                    };
                } catch (err) {
                    console.error('[Tool:consultar_servicios] ERROR:', err);
                    return { success: false, error: 'No se pudieron cargar los servicios.', servicios: [], categorias_disponibles: null };
                }
            }
        }),

        consultar_disponibilidad: tool({
            description: 'Busca horarios disponibles basándose en los servicios elegidos. REQUIERE IDENTIFICACIÓN.',
            parameters: z.object({
                serviceIds: z.array(z.string()).describe('Lista de IDs de los servicios en el carrito'),
                fecha: z.string().describe('Fecha en formato YYYY-MM-DD'),
            }),
            execute: async ({ serviceIds, fecha }: { serviceIds: string[]; fecha: string }) => {
                if (!currentLeadId) {
                    return { disponible: false, error: 'Primero necesito tu nombre para ver disponibilidad.' };
                }
                try {
                    const services = await getActiveServices();
                    const selected = services.filter(s => serviceIds.includes(s.id));
                    
                    if (selected.length === 0) {
                        return { disponible: false, error: 'No seleccionaste servicios válidos.' };
                    }

                    const totalDuration = selected.reduce((acc, s) => acc + (s.duration_min || 30), 0);
                    
                    // Lógica de Combos: Obtenemos todas las categorías únicas involucradas
                    const uniqueCategories = [...new Set(selected.map(s => s.category_id))];
                    const primaryCategoryId = uniqueCategories[0] || '';

                    const start = new Date(fecha + "T00:00:00");
                    const end = new Date(start);
                    end.setDate(end.getDate() + 1);

                    // Buscamos disponibilidad basándonos en la duración total
                    // (Nota: Esto asume que el local maneja turnos secuenciales o que la función de DB resuelve el solapamiento)
                    const [slots, allStaff] = await Promise.all([
                        getAvailableSlotsFromDB(primaryCategoryId, start, end, totalDuration),
                        getAllStaff()
                    ]);
                    
                    if (!slots || slots.length === 0) {
                        return { disponible: false, mensaje: 'No hay horarios disponibles para esa fecha.', fecha, horarios: [], error: null };
                    }

                    return {
                        disponible: true,
                        fecha,
                        horarios: slots.slice(0, 8).map(s => {
                            const d = new Date(s.slot_time);
                            const staffMember = allStaff.find(st => st.id === s.staff_id);
                            return {
                                hora: d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
                                staff_name: staffMember?.name || "Especialista",
                                staff_role: staffMember?.role || "Staff",
                                staff_id: s.staff_id,
                                total_duration: totalDuration
                            };
                        }),
                        mensaje: uniqueCategories.length > 1 ? `Coordinando disponibilidad para ${uniqueCategories.length} especialidades...` : null
                    };
                } catch (err) {
                    console.error('[Tool:consultar_disponibilidad] ERROR:', err);
                    return { disponible: false, error: 'Error buscando disponibilidad.', mensaje: null, fecha: null, horarios: [] };
                }
            }
        }),

        listar_cuerpo_profesional: tool({
            description: 'Lista a los profesionales que trabajan en el local, sus nombres y roles. Usalo para que el cliente sepa quiénes lo atenderán.',
            parameters: z.object({}),
            execute: async () => {
                try {
                    const staff = await getAllStaff();
                    return staff.map(s => ({
                        nombre: s.name,
                        rol: s.role
                    }));
                } catch (err) {
                    console.error('[Tool:listar_cuerpo_profesional] ERROR:', err);
                    return { error: 'No se pudo obtener la lista de profesionales.' };
                }
            }
        }),

        modificar_carrito: tool({
            description: 'Agrega o quita servicios del carrito del cliente. Usalo cada vez que el cliente elija un servicio de la imagen.',
            parameters: z.object({
                serviceIds: z.array(z.string()).describe('Lista completa de IDs de servicios que deben quedar en el carrito'),
                accion: z.enum(['agregar', 'quitar', 'reemplazar']).describe('Qué acción se está realizando')
            }),
            execute: async ({ serviceIds, accion }: { serviceIds: string[]; accion: string }) => {
                if (!currentLeadId) {
                    return { success: false, error: 'Primero necesito registrarte para manejar tu carrito.' };
                }
                try {
                    const services = await getActiveServices();
                    const selected = services.filter(s => serviceIds.includes(s.id));
                    
                    const newState = {
                        selectedServiceIds: serviceIds,
                        clientName: null, // Se puede expandir
                        stage: 'selecting_services'
                    };

                    await db.update(schema.leads)
                        .set({ current_state: newState, updated_at: new Date() })
                        .where(eq(schema.leads.id, currentLeadId));

                    return { 
                        success: true, 
                        total_items: selected.length,
                        servicios: selected.map(s => s.title),
                        mensaje: `Carrito actualizado (${accion}). Tenés ${selected.length} servicios seleccionados.`
                    };
                } catch (err) {
                    console.error('[Tool:modificar_carrito] ERROR:', err);
                    return { success: false, error: 'No se pudo actualizar el carrito.' };
                }
            }
        }),

        agendar_turno: tool({
            description: 'Confirma y agenda un turno en la base de datos.',
            parameters: z.object({
                serviceIds: z.array(z.string()).describe('IDs de los servicios elegidos'),
                dateTimeIso: z.string().describe('Fecha y hora en ISO, ej: "2026-03-27T15:00:00"'),
            }),
            execute: async ({ serviceIds, dateTimeIso }: { serviceIds: string[]; dateTimeIso: string }) => {
                if (!currentLeadId) {
                    return { success: false, error: 'Primero necesito tu nombre para agendar.', mensaje: null, total: 0, duracion: 0 };
                }
                try {
                    const [activeServices, allCategories] = await Promise.all([
                        getActiveServices(),
                        getCategories()
                    ]);
                    
                    const selected = activeServices.filter(s => serviceIds.includes(s.id));
                    if (selected.length === 0) {
                        return { success: false, error: 'No se encontraron los servicios seleccionados.', mensaje: null, total: 0, duracion: 0 };
                    }

                    const totalPrice = selected.reduce((sum, s) => sum + Number(s.price || 0), 0);
                    const totalDuration = selected.reduce((sum, s) => sum + Number(s.duration_min || 30), 0);
                    const catIds = [...new Set(selected.map(s => s.category_id))];
                    const catNames = allCategories.filter(c => catIds.includes(c.id)).map(c => c.name).join(' y ');

                    await createAppointment(currentLeadId, orgId, dateTimeIso, catNames, totalPrice, totalDuration, selected);
                    
                    // Limpiar carrito después de agendar
                    await db.update(schema.leads)
                        .set({ current_state: null, updated_at: new Date() })
                        .where(eq(schema.leads.id, currentLeadId));

                    return {
                        success: true,
                        mensaje: `Turno confirmado para ${catNames}`,
                        total: totalPrice,
                        duracion: totalDuration,
                        error: null as string | null
                    };
                } catch (err) {
                    console.error('[Tool:agendar_turno] ERROR:', err);
                    return { success: false, error: 'Error guardando el turno.', mensaje: null, total: 0, duracion: 0 };
                }
            }
        })
    };
};
