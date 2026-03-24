import { tool } from 'ai';
import { z } from 'zod';
import { 
    getCategories, 
    getActiveServices, 
    getAvailableSlotsFromDB, 
    getStaffByCategory,
    createLead
} from './db.js';

export const buildTools = (leadId: string | null, orgId: string, initId?: string | null) => ({
    registrar_cliente: tool({
        description: 'Crea un nuevo cliente (lead) en la base de datos. Úsalo en cuanto el cliente proporcione su Nombre o Nombre y Apellido al inicio. Es vital capturar ambos si están presentes.',
        parameters: z.object({
            nombre: z.string().describe('El nombre de pila del cliente. Si el cliente da su nombre completo (ej: "Juan Perez"), extrae SOLO el nombre de pila aquí ("Juan").'),
            apellido: z.string().describe('El apellido del cliente. Si el cliente dio su nombre y apellido juntos en el mensaje anterior (ej: "Juan Perez"), DEBES extraer el apellido aquí ("Perez"). No lo dejes vacío si ya lo proporcionó.'),
            telefono: z.string().optional().describe('Teléfono de contacto.'),
            initId: z.string().optional().describe('ID de inicialización del chat (opcional).'),
        }) as any,
        execute: async (args: any) => {
            const { nombre, apellido, telefono, initId: argInitId } = args;
            try {
                const fullName = `${nombre} ${apellido}`.trim();
                const contactInfo = { 
                    phone: telefono || "Sin teléfono", 
                    source: "web_chatbot",
                    initId: argInitId || initId || null
                };
                const newLead = await createLead(orgId, fullName, contactInfo);
                console.log("[Tool] Created Lead with InitId:", newLead.id, initId);
                return { 
                    success: true, 
                    id: newLead.id, 
                    mensaje: `Cliente ${fullName} registrado con éxito. Ya podés informarle precios o agendar turnos.` 
                };
            } catch (err: any) {
                console.error('[AI Tool] Error en registrar_cliente:', err);
                return { error: 'Error al registrar cliente: ' + err.message };
            }
        }
    }),

    consultar_servicios: tool({
        description: 'Devuelve el listado completo de categorías (padres) y servicios específicos (hijos) con sus precios e IDs. Úsalo siempre que necesites saber qué ofrece el centro o para confirmar los IDs de los servicios que quiere el cliente.',
        parameters: z.object({}) as any,
        execute: async () => {
            try {
                const [categories, services] = await Promise.all([
                    getCategories(),
                    getActiveServices()
                ]);
                
                const result = categories.map(cat => {
                    const catServices = services.filter(s => s.category_id === cat.id);
                    return {
                        categoria: cat.name,
                        id_categoria: cat.id,
                        servicios: catServices.map(s => {
                            const rawDuration = (s as any).duration_min || parseInt((s as any).duration) || 30;
                            return {
                                id: s.id,
                                titulo: s.title,
                                precio: s.price,
                                duracion_minutos: typeof rawDuration === 'number' ? rawDuration : 30
                            };
                        })
                    };
                });
                return result as any;
            } catch (err: any) {
                console.error('[AI Tool] Error in consultar_servicios:', err);
                throw err;
            }
        }
    }),

    consultar_disponibilidad: tool({
        description: 'Busca horarios disponibles reales para uno o más servicios. SIEMPRE debes usar esta herramienta antes de confirmar un horario con el cliente.',
        parameters: z.object({
            categoriaId: z.string().describe('El ID de la categoría principal (UUID) a la que pertenece el servicio requerido.'),
            fecha: z.string().describe('La fecha a consultar en formato YYYY-MM-DD. Si el cliente dice "mañana", debes calcular la fecha exacta basándote en que hoy es la fecha actual. ¡Obligatorio!'),
        }) as any,
        execute: async (args: any) => {
            const { categoriaId, fecha } = args;
            const staff = await getStaffByCategory(categoriaId);
            if (staff.length === 0) {
                return { error: 'No hay profesionales disponibles que realicen este tipo de servicio.' };
            }

            const searchStart = new Date(fecha + "T00:00:00");
            const searchEnd = new Date(searchStart);
            searchEnd.setDate(searchEnd.getDate() + 1);

            const slots = await getAvailableSlotsFromDB(categoriaId, searchStart, searchEnd);
            
            if (slots.length === 0) {
                return { mensaje: 'No hay disponibilidad para esa fecha exacta. Por favor ofrece otro día u otro horario.' };
            }

            const availableSlots = slots.slice(0, 8).map(s => {
                const dateObj = new Date(s.slot_time);
                return {
                    fecha: dateObj.toISOString().split('T')[0],
                    hora: dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Cordoba', hour12: false }),
                    staff_id: s.staff_id
                };
            });

            return { 
                mensaje: 'Horarios encontrados con éxito.', 
                horarios_disponibles: availableSlots 
            };
        }
    }),

    agendar_turno: tool({
        description: 'Programa y guarda un turno en la base de datos de manera definitiva. REQUIERE que tengas el ID del servicio, fecha, hora y datos del cliente.',
        parameters: z.object({
            serviceIds: z.array(z.string()).describe('Array con los IDs exactos de los servicios elegidos.'),
            dateTimeIso: z.string().describe('Fecha y hora del turno en formato ISO, ej: "2024-06-25T15:00:00".'),
        }) as any,
        execute: async (args: any) => {
            const { serviceIds, dateTimeIso } = args;
            if (!leadId) {
                return { error: 'Falla al agendar: No hay un ID de lead (cliente) instanciado. Pide su nombre y número por favor.' };
            }

            const services = await getActiveServices();
            const categories = await getCategories();
            
            const selectedServices = services.filter(s => serviceIds.includes(s.id));
            if (selectedServices.length === 0) {
                return { error: 'IDs de servicios inválidos.' };
            }

            const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
            const totalDuration = selectedServices.reduce((sum, s) => sum + Number((s as any).duration || (s as any).duration_min), 0);

            // Group category names for the "service_type" summary
            const catIds = [...new Set(selectedServices.map(s => s.category_id))];
            const catNames = categories.filter(c => catIds.includes(c.id)).map(c => c.name).join(' y ');

            try {
                // Not importing createAppointment directly inside here to avoid circular dependencies if any, 
                // but since it's imported at the top, we just use it:
                const { createAppointment } = await import('./db.js');
                await createAppointment(leadId, orgId, dateTimeIso, catNames, totalPrice, totalDuration, selectedServices as any);
                
                return {
                    exito: true as const,
                    mensaje: `Turno guardado con éxito para: ${catNames}`,
                    total_pagar: totalPrice,
                    duracion_total: totalDuration
                };
            } catch (err: unknown) {
                console.error('[AI Tool] Error agendando turno:', err);
                return { error: 'Error interno en BD al guardar turno: ' + (err as Error).message };
            }
        }
    })
});
