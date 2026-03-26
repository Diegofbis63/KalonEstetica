import { tool } from 'ai';
import { z } from 'zod';
import { 
    getCategories, 
    getActiveServices, 
    getAvailableSlotsFromDB, 
    getStaffByCategory,
    createLead,
    type ContactInfo,
    createAppointment
} from './db.js';

/**
 * Herramientas del Chatbot KÂLON.
 * 
 * Cada herramienta:
 * - Tiene try-catch propio (NUNCA crashea el stream)
 * - Retorna objetos simples que la IA puede leer y presentar
 * - Los logs son internos, no se exponen al usuario
 */
export const buildTools = (leadId: string | null, orgId: string | null, initId?: string | null) => ({
    
    registrar_cliente: tool({
        description: 'Registra un nuevo cliente en KÂLON. Usalo cuando el cliente te diga su nombre y apellido.',
        parameters: z.object({
            nombre: z.string().describe('Nombre de pila del cliente'),
            apellido: z.string().describe('Apellido del cliente'),
        }),
        execute: async ({ nombre, apellido }) => {
            try {
                const fullName = `${nombre} ${apellido}`.trim();
                const contactInfo: ContactInfo = { 
                    phone: "Sin teléfono", 
                    source: "web_chatbot",
                    initId: initId || null
                };
                const newLead = await createLead(orgId, fullName, contactInfo);
                console.log(`[Tool:registrar_cliente] Lead creado: ${newLead.id} (${fullName})`);
                return { 
                    success: true, 
                    leadId: newLead.id, 
                    nombre: fullName,
                    mensaje: `Cliente ${fullName} registrado exitosamente.` 
                };
            } catch (err) {
                console.error('[Tool:registrar_cliente] ERROR:', err);
                return { success: false, error: 'No se pudo registrar al cliente. Intentá de nuevo.' };
            }
        }
    }),

    listar_categorias_principales: tool({
        description: 'Lista las categorías principales de servicios de KÂLON (ej: Depilación, Pestañas, Uñas, etc). Usalo después de registrar al cliente para mostrarle el menú.',
        parameters: z.object({}),
        execute: async () => {
            try {
                const categories = await getCategories();
                console.log(`[Tool:listar_categorias] ${categories.length} categorías encontradas`);
                return categories.map((c, i) => ({
                    numero: i + 1,
                    nombre: c.name,
                    id: c.id
                }));
            } catch (err) {
                console.error('[Tool:listar_categorias] ERROR:', err);
                return [{ error: 'No se pudieron cargar las categorías.' }];
            }
        }
    }),

    consultar_servicios: tool({
        description: 'Muestra los servicios específicos con precios dentro de una categoría. Acepta el nombre de la categoría (ej: "depilacion", "pestañas") o su UUID.',
        parameters: z.object({
            categoriaNombre: z.string().describe('Nombre de la categoría (ej: "Depilación", "Pestañas"). También acepta UUID.')
        }),
        execute: async ({ categoriaNombre }) => {
            try {
                const [categories, services] = await Promise.all([
                    getCategories(),
                    getActiveServices()
                ]);
                
                const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                const searchTerm = normalize(categoriaNombre);
                
                const filteredCats = categories.filter(c => 
                    c.id === categoriaNombre || 
                    normalize(c.name).includes(searchTerm) ||
                    searchTerm.includes(normalize(c.name))
                );

                if (filteredCats.length === 0) {
                    console.log(`[Tool:consultar_servicios] No match for "${categoriaNombre}". Available: ${categories.map(c => c.name).join(', ')}`);
                    return [{ 
                        error: `No encontré la categoría "${categoriaNombre}".`, 
                        categorias_disponibles: categories.map((c, i) => `${i+1}. ${c.name}`).join(', ')
                    }];
                }

                const allMatchServices: any[] = [];
                filteredCats.forEach(cat => {
                    const catServices = services.filter(s => s.category_id === cat.id && s.active);
                    catServices.forEach(s => {
                        allMatchServices.push({
                            label: s.title,
                            price: s.price,
                            id: s.id,
                            category: cat.name
                        });
                    });
                });

                if (allMatchServices.length === 0) {
                    return [{ error: `No hay servicios activos en ${filteredCats[0].name}.` }];
                }

                console.log(`[Tool:consultar_servicios] Found ${allMatchServices.length} services for ${categoriaNombre}`);
                return allMatchServices;
            } catch (err) {
                console.error('[Tool:consultar_servicios] ERROR:', err);
                return [{ error: 'No se pudieron cargar los servicios.' }];
            }
        }
    }),

    consultar_disponibilidad: tool({
        description: 'Busca horarios disponibles para un servicio en una fecha específica.',
        parameters: z.object({
            categoriaId: z.string().describe('UUID de la categoría del servicio'),
            fecha: z.string().describe('Fecha en formato YYYY-MM-DD'),
        }),
        execute: async ({ categoriaId, fecha }) => {
            try {
                const staff = await getStaffByCategory(categoriaId);
                if (staff.length === 0) {
                    return { disponible: false, mensaje: 'No hay profesionales para este servicio.' };
                }

                const start = new Date(fecha + "T00:00:00");
                const end = new Date(start);
                end.setDate(end.getDate() + 1);

                const slots = await getAvailableSlotsFromDB(categoriaId, start, end);
                
                if (!slots || slots.length === 0) {
                    return { disponible: false, mensaje: 'No hay horarios disponibles para esa fecha.' };
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
                    })
                };
            } catch (err) {
                console.error('[Tool:consultar_disponibilidad] ERROR:', err);
                return { disponible: false, error: 'Error buscando disponibilidad.' };
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
            if (!leadId) {
                return { success: false, error: 'Primero necesito el nombre del cliente para agendar.' };
            }
            try {
                const [services, categories] = await Promise.all([
                    getActiveServices(),
                    getCategories()
                ]);
                
                const selected = services.filter(s => serviceIds.includes(s.id));
                if (selected.length === 0) {
                    return { success: false, error: 'No se encontraron los servicios seleccionados.' };
                }

                const totalPrice = selected.reduce((sum, s) => sum + Number(s.price || 0), 0);
                const totalDuration = selected.reduce((sum, s) => sum + Number((s as any).duration_min || 30), 0);
                const catIds = [...new Set(selected.map(s => s.category_id))];
                const catNames = categories.filter(c => catIds.includes(c.id)).map(c => c.name).join(' y ');

                await createAppointment(leadId, orgId, dateTimeIso, catNames, totalPrice, totalDuration, selected as any);
                
                return {
                    success: true,
                    mensaje: `Turno confirmado para ${catNames}`,
                    total: totalPrice,
                    duracion: totalDuration
                };
            } catch (err) {
                console.error('[Tool:agendar_turno] ERROR:', err);
                return { success: false, error: 'Error guardando el turno.' };
            }
        }
    })
});
