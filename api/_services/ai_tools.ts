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
    getServicesByCategory
} from './db.js';

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
                    const newLead = await createLead(orgId, fullName, contactInfo);
                    
                    if (!newLead) {
                        return { success: false, error: 'Hubo un problemita guardando tus datos. ¿Podrías decirme tu nombre de nuevo? Perdón la molestia.' };
                    }

                    currentLeadId = newLead.id; 
                    console.log(`[Tool:registrar_cliente] Lead creado: ${newLead.id} (${fullName})`);
                    return { 
                        success: true, 
                        leadId: newLead.id, 
                        nombre: fullName,
                        mensaje: `¡Excelente, ${fullName}! Ya te anoté en mi agenda. ¿En qué puedo ayudarte hoy?` 
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
            description: 'Busca horarios disponibles. REQUIERE IDENTIFICACIÓN PREVIA.',
            parameters: z.object({
                categoriaId: z.string().describe('UUID de la categoría del servicio'),
                fecha: z.string().describe('Fecha en formato YYYY-MM-DD'),
            }),
            execute: async ({ categoriaId, fecha }: { categoriaId: string; fecha: string }) => {
                if (!currentLeadId) {
                    return { disponible: false, error: 'Primero necesito tu nombre y apellido para ver disponibilidad.' };
                }
                try {
                    const staffMembers = await getStaffByCategory(categoriaId);
                    if (staffMembers.length === 0) {
                        return { disponible: false, mensaje: 'No hay profesionales para este servicio.', fecha: null, horarios: [], error: null };
                    }

                    const start = new Date(fecha + "T00:00:00");
                    const end = new Date(start);
                    end.setDate(end.getDate() + 1);

                    const slots = await getAvailableSlotsFromDB(categoriaId, start, end);
                    
                    if (!slots || slots.length === 0) {
                        return { disponible: false, mensaje: 'No hay horarios disponibles para esa fecha.', fecha, horarios: [], error: null };
                    }

                    return {
                        disponible: true,
                        fecha,
                        horarios: slots.slice(0, 8).map(s => {
                            const d = new Date(s.slot_time);
                            return {
                                hora: d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
                                staff_id: s.staff_id
                            };
                        }),
                        mensaje: null as string | null,
                        error: null as string | null
                    };
                } catch (err) {
                    console.error('[Tool:consultar_disponibilidad] ERROR:', err);
                    return { disponible: false, error: 'Error buscando disponibilidad.', mensaje: null, fecha: null, horarios: [] };
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
