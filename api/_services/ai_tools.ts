import { tool } from 'ai';
import { z } from 'zod';
import { 
    getCategories, 
    getActiveServices, 
    getAvailableSlotsFromDB, 
    getStaffBySpecialty 
} from './db.js';

export const buildTools = (leadId: string | null, orgId: string) => ({
    consultar_servicios: tool({
        description: 'Devuelve el listado completo de categorías (padres) y servicios específicos (hijos) con sus precios e IDs. Úsalo siempre que necesites saber qué ofrece el centro o para confirmar los IDs de los servicios que quiere el cliente.',
        parameters: z.object({}),
        execute: async () => {
            const [categories, services] = await Promise.all([
                getCategories(),
                getActiveServices()
            ]);
            
            return categories.map(cat => {
                const catServices = services.filter(s => s.category_id === cat.id);
                return {
                    categoria: cat.name,
                    id_categoria: cat.id,
                    servicios: catServices.map(s => ({
                        id: s.id,
                        titulo: s.title,
                        precio: s.price,
                        duracion_minutos: (s as any).duration || (s as any).duration_min
                    }))
                };
            });
        }
    }),

    consultar_disponibilidad: tool({
        description: 'Busca horarios disponibles reales para uno o más servicios. SIEMPRE debes usar esta herramienta antes de confirmar un horario con el cliente.',
        parameters: z.object({
            categoriaId: z.string().describe('El ID de la categoría principal (UUID) a la que pertenece el servicio requerido.'),
            fecha: z.string().describe('La fecha a consultar en formato YYYY-MM-DD. Si el cliente dice "mañana", debes calcular la fecha exacta basándote en que hoy es la fecha actual. ¡Obligatorio!'),
        }),
        execute: async ({ categoriaId, fecha }: { categoriaId: string; fecha: string; }) => {
            const staff = await getStaffBySpecialty(categoriaId);
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
        }),
        execute: async ({ serviceIds, dateTimeIso }: { serviceIds: string[]; dateTimeIso: string; }) => {
            if (!leadId) {
                return { error: 'Falla al agendar: No hay un ID de lead (cliente) instanciado. Pide su nombre y número por favor.' };
            }

            // Get the full services to calculate price/durations
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
