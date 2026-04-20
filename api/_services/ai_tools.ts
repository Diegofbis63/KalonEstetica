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

// --- DATOS DE RESPALDO (BACKUP) ---
// Si la DB falla, el bot usará esto para no quedarse mudo.
const FALLBACK_CATEGORIES = [
    { id: '1', name: 'Pestañas' },
    { id: '2', name: 'Cejas' },
    { id: '3', name: 'Uñas' },
    { id: '4', name: 'Depilación' }
];

const FALLBACK_CATALOG_IMAGE = "https://kalon-estetica.vercel.app/assets/centro-kalon-estetica--hRU61qu.png";

/**
 * Herramientas del Chatbot KÂLON.
 */
export const buildTools = (initialLeadId: string | null = null, orgId: string | null = null, initId: string | null = null) => {
    let currentLeadId = initialLeadId;

    return {
        registrar_cliente: tool({
            description: 'PASO 1: Registra al cliente. Solo requiere nombre y apellido.',
            parameters: z.object({
                nombre: z.string().describe('Nombre de pila'),
                apellido: z.string().describe('Apellido'),
            }),
            execute: async ({ nombre, apellido }) => {
                const fullName = `${nombre} ${apellido}`.trim();
                console.log('[PASO 1] Registrando:', fullName);
                
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
                            message: `¡Perfecto ${nombre}! Ya te registré en nuestro sistema. 😊`,
                            next_action_hint: "MANDATORIO: Inmediatamente llamá a 'listar_categorias_principales' para mostrar el catálogo maestro al cliente."
                        };
                    }
                    
                    // Fallback de ID para no romper el flujo
                    currentLeadId = `temp_${Date.now()}`;
                    return { success: true, leadId: currentLeadId, message: `¡Gusto en conocerte ${nombre}!` };

                } catch (err) {
                    console.error('[Error Registro]:', err);
                    currentLeadId = `temp_${Date.now()}`;
                    return { 
                        success: true, 
                        leadId: currentLeadId, 
                        message: `¡Hola ${nombre}! Tuve un pequeño problema técnico al registrarte, pero igual podemos seguir adelante. ¿Qué servicio estás buscando hoy? ✨`,
                        note: "Modo contingencia activo" 
                    };
                }
            }
        }),

        listar_categorias_principales: tool({
            description: 'PASO 2: Muestra el catálogo maestro y categorías.',
            parameters: z.object({}),
            execute: async () => {
                console.log('[PASO 2] Cargando Catálogo');
                try {
                    const categories = await getCategories().catch(() => FALLBACK_CATEGORIES);
                    const rows = await sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []);
                    
                    let imageUrl = FALLBACK_CATALOG_IMAGE;
                    if (rows && rows.length > 0) imageUrl = rows[0].value;

                    return {
                        success: true,
                        price_list_url: imageUrl,
                        categorias: (categories.length > 0 ? categories : FALLBACK_CATEGORIES).map(c => ({
                            id: c.id,
                            nombre: c.name
                        })),
                        message: "Acá podés ver todas nuestras especialidades. ✨ ¿Sobre cuál te gustaría recibir más información o ver los precios?",
                        next_action_hint: "Esperá a que el cliente elija una categoría o servicio. Si ya eligió algo, llamá a 'consultar_servicios' para esa categoría."
                    };
                } catch (err) {
                    return {
                        success: true,
                        price_list_url: FALLBACK_CATALOG_IMAGE,
                        categorias: FALLBACK_CATEGORIES
                    };
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
                    return { 
                        success: true, 
                        catalogs,
                        message: "¡Excelente elección! 🌸 Acá tenés los detalles y precios de estos servicios. ¿Te gustaría sumar alguno al carrito para agendar?"
                    };
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
