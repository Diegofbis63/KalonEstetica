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

const FALLBACK_CATALOG_IMAGE = "https://kalon-estetica.vercel.app/template_chatbot.png";

/**
 * Herramientas del Chatbot KÂLON.
 */
export const buildTools = (initialLeadId: string | null = null, orgId: string | null = null, initId: string | null = null) => {
    let currentLeadId = initialLeadId;

    return {
        registrar_e_iniciar_catalogo: tool({
            description: 'ETAPA INICIAL: Registra al cliente Y muestra el catálogo principal en un solo paso. USAR CUANDO EL USUARIO DA SU NOMBRE.',
            parameters: z.object({
                nombre_completo: z.string().describe('Nombre y apellido del cliente')
            }),
            execute: async ({ nombre_completo }) => {
                console.log('[ATOMIC] Registro + Catalogo para:', nombre_completo);
                try {
                    // 1. Registro
                    const tempPhone = `anon_${initId || Date.now()}`;
                    const contactInfo: ContactInfo = { phone: tempPhone, source: "chatbot", initId: initId || null };
                    const newLead = await createLead(orgId, nombre_completo, contactInfo) as any;
                    currentLeadId = newLead?.id || `temp_${Date.now()}`;

                    // 2. Catalogo
                    const categories = await getCategories().catch(() => FALLBACK_CATEGORIES);
                    const rows = await sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []);
                    const imageUrl = (rows && rows.length > 0) ? rows[0].value : FALLBACK_CATALOG_IMAGE;

                    return {
                        success: true,
                        leadId: currentLeadId,
                        client_name: nombre_completo,
                        price_list_url: imageUrl,
                        instruction: "IMPORTANTE: Responde ÚNICAMENTE con un saludo y bienvenida. La imagen con el catálogo de servicios YA SE ENVIÓ en la pantalla del usuario. No tienes que hacer NADA MÁS. DALE LA BIENVENIDA Y ESPERA SU RESPUESTA."
                    };
                } catch (err) {
                    console.error('[ATOMIC Error]:', err);
                    return { success: false, error: "Error en proceso atómico" };
                }
            }
        }),

        registrar_cliente: tool({
            description: 'DEPRECATED: Usar registrar_e_iniciar_catalogo en su lugar.',
            parameters: z.object({ nombre_completo: z.string() }),
            execute: async ({ nombre_completo }) => ({ success: true, message: "Usar la otra herramienta" })
        }),

        listar_categorias_principales: tool({
            description: 'Muestra el Catálogo Maestro. Útil si el usuario pide ver servicios de nuevo.',
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
                                    precio: s.price,
                                    image_url: s.image_url // Imagen específica del servicio
                                })),
                                price_list_url: category?.price_list_url || null // Imagen de la categoría
                            });
                        }
                    }
                    return { 
                        success: true, 
                        total_categories: catalogs.length,
                        catalogs,
                        instruction: "Presentá estos servicios al cliente con entusiasmo. Si hay imágenes (image_url), menciónalas. NO repitas información técnica innecesaria."
                    };
                } catch (err) {
                    console.error('[Tool:consultar_servicios] ERROR:', err);
                    return { success: false, error: 'Hubo un error al recuperar el catálogo. Por favor, intenta de nuevo.' };
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
                                staff_id: s.staff_id,
                                label: `${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} con ${staffMember?.name || "Especialista"}`
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
