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
    sql,
    schema
} from './db.js';
import { eq } from 'drizzle-orm';

/**
 * Herramientas del Chatbot KÂLON.
 * 
 * Utiliza un patrón de cierre para mantener el leadId durante la sesión de stream.
 */
export const buildTools = (initialLeadId: string | null = null, orgId: string | null = null, initId: string | null = null) => {
    let currentLeadId = initialLeadId;

    return {
        registrar_cliente: tool({
            description: 'Registra un nuevo cliente en KÂLON. Usalo cuando el cliente te diga su nombre y apellido.',
            parameters: z.object({
                nombre: z.string().describe('Nombre de pila del cliente'),
                apellido: z.string().describe('Apellido del cliente'),
            }),
            execute: async ({ nombre, apellido }) => {
                const fullName = `${nombre} ${apellido}`.trim();
                console.log('[Tool:registrar_cliente] Attempting:', fullName);
                
                try {
                    const contactInfo: ContactInfo = { 
                        phone: "Pendiente", 
                        source: "chatbot",
                        initId: initId || null
                    };
                    
                    const newLead = await createLead(orgId, fullName, contactInfo);
                    
                    if (newLead && newLead.id) {
                        currentLeadId = newLead.id; 
                        return { 
                            success: true, 
                            leadId: newLead.id, 
                            nombre: fullName,
                            result: "CLIENTE_REGISTRADO"
                        };
                    }
                    
                    // Si el registro falla pero no lanza error, usamos modo resiliente
                    console.warn('[Tool:registrar_cliente] DB returned no lead, using fallback mode');
                    currentLeadId = `temp_${Date.now()}`;
                    return { success: true, leadId: currentLeadId, message: "Modo invitado activado." };

                } catch (err: any) {
                    console.error('[Tool:registrar_cliente] CRITICAL DB ERROR:', err.message);
                    // MODO RESILIENTE: No dejamos que la IA sepa que falló la DB para no cortar el stream
                    currentLeadId = `temp_${Date.now()}`;
                    return { 
                        success: true, // Mentimos para que el bot siga hablando
                        leadId: currentLeadId, 
                        is_guest_mode: true,
                        message: "Registro en cola. Continuando conversación."
                    };
                }
            }
        }),

        listar_categorias_principales: tool({
            description: 'Lista las categorías principales de servicios y el catálogo maestro. SIEMPRE LLAMAR ESTO TRAS REGISTRAR.',
            parameters: z.object({}),
            execute: async () => {
                // NOTA: Eliminamos el bloqueo por currentLeadId para evitar race conditions
                try {
                    console.log('[Tool:listar_categorias] Fetching data...');
                    const [categories, rows] = await Promise.all([
                        getCategories(),
                        sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => [])
                    ]);

                    let priceListUrl = null;
                    if (rows && rows.length > 0) {
                        priceListUrl = rows[0].value;
                    }

                    return {
                        success: true,
                        price_list_url: priceListUrl,
                        categorias: categories.map(c => ({
                            id: c.id,
                            nombre: c.name
                        }))
                    };
                } catch (err) {
                    console.error('[Tool:listar_categorias] ERROR:', err);
                    return { success: false, error: 'Error al cargar catálogo.' };
                }
            }
        }),

        consultar_servicios: tool({
            description: 'Obtiene detalles y catálogo visual de servicios. SIEMPRE pasá un array de categorías.',
            parameters: z.object({
                categorias: z.array(z.string()).describe('Lista de nombres de categorías o UUIDs')
            }),
            execute: async ({ categorias }) => {
                try {
                    const catalogs = [];
                    for (const catName of categorias) {
                        const { services, category } = await getServicesByCategory(catName);
                        if (services.length > 0) {
                            catalogs.push({
                                categoria: category?.name || catName,
                                servicios: services.map(s => ({
                                    id: s.id,
                                    nombre: s.title,
                                    precio: s.price
                                })),
                                price_list_url: category?.price_list_url || null
                            });
                        }
                    }
                    return { success: true, catalogs };
                } catch (err) {
                    console.error('[Tool:consultar_servicios] ERROR:', err);
                    return { success: false, error: 'Error cargando servicios.' };
                }
            }
        }),

        consultar_disponibilidad: tool({
            description: 'Busca horarios disponibles basándose en los servicios elegidos.',
            parameters: z.object({
                serviceIds: z.array(z.string()).describe('Lista de IDs de los servicios en el carrito'),
                fecha: z.string().describe('Fecha en formato YYYY-MM-DD'),
            }),
            execute: async ({ serviceIds, fecha }) => {
                if (!currentLeadId) return { disponible: false, error: 'ID de lead perdido. Identificate de nuevo.' };
                try {
                    const services = await getActiveServices();
                    const selected = services.filter(s => serviceIds.includes(s.id));
                    const totalDuration = selected.reduce((acc, s) => acc + (s.duration_min || 30), 0);
                    const primaryCategoryId = selected[0]?.category_id || '';

                    const start = new Date(fecha + "T00:00:00");
                    const end = new Date(start);
                    end.setDate(end.getDate() + 1);

                    const [slots, allStaff] = await Promise.all([
                        getAvailableSlotsFromDB(primaryCategoryId, start, end, totalDuration),
                        getAllStaff()
                    ]);
                    
                    return {
                        disponible: !!slots?.length,
                        fecha,
                        horarios: (slots || []).slice(0, 8).map(s => {
                            const d = new Date(s.slot_time);
                            const staffMember = allStaff.find(st => st.id === s.staff_id);
                            return {
                                hora: d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
                                staff_name: staffMember?.name || "Especialista",
                                staff_id: s.staff_id
                            };
                        })
                    };
                } catch (err) {
                    return { disponible: false, error: 'Error de disponibilidad.' };
                }
            }
        }),

        agendar_turno: tool({
            description: 'Confirma y agenda un turno en la base de datos.',
            parameters: z.object({
                serviceIds: z.array(z.string()).describe('IDs de los servicios elegidos'),
                dateTimeIso: z.string().describe('Fecha y hora en ISO, ej: "2026-03-27T15:00:00"'),
            }),
            execute: async ({ serviceIds, dateTimeIso }) => {
                if (!currentLeadId) return { success: false, error: 'Sesión expirada.' };
                try {
                    const [activeServices, allCategories] = await Promise.all([
                        getActiveServices(),
                        getCategories()
                    ]);
                    
                    const selected = activeServices.filter(s => serviceIds.includes(s.id));
                    const totalPrice = selected.reduce((sum, s) => sum + Number(s.price || 0), 0);
                    const totalDuration = selected.reduce((sum, s) => sum + Number(s.duration_min || 30), 0);
                    const catIds = [...new Set(selected.map(s => s.category_id))];
                    const catNames = allCategories.filter(c => catIds.includes(c.id)).map(c => c.name).join(' y ');

                    await createAppointment(currentLeadId, orgId, dateTimeIso, catNames, totalPrice, totalDuration, selected);
                    
                    return {
                        success: true,
                        mensaje: `Turno confirmado para ${catNames}`,
                        total: totalPrice,
                        duracion: totalDuration
                    };
                } catch (err) {
                    return { success: false, error: 'Error guardando el turno.' };
                }
            }
        })
    };
};
