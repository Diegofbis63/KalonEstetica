import { tool } from 'ai';
import { z } from 'zod';
import { 
    getCategories, 
    getServicesByCategory, 
    getAvailableSlotsFromDB, 
    updateLeadState 
} from '../_services/db.js';

import { sql } from '../_services/db.js';
import type { VercelResponse } from '@vercel/node';

export const chatbotTools = (leadId: string | null, currentState: any, res: VercelResponse) => ({
    obtener_categorias_padre: tool({
        description: 'Obtiene la lista de categorías principales de servicios (ej. Pestañas, Depilación, Masajes). Úsalo obligatoriamente al inicio para enviar el catálogo visual, o cuando el cliente pregunta qué hacen.',
        parameters: z.object({}),
        execute: async () => {
            const configRows = await sql`SELECT value FROM business_config WHERE key = 'MAIN_CATALOG_IMAGE_URL' LIMIT 1`.catch(() => []);
            const mainImageUrl = configRows?.[0]?.value || 'https://ijltsqfshvunmngvbeue.supabase.co/storage/v1/object/public/kalon-services/CATALOGO%20KALON.png';
            res.write(`data: ${JSON.stringify({ media_url: mainImageUrl })}\n\n`);
            
            const cats = await getCategories();
            return {
                mensaje: "Estas son las categorías principales disponibles",
                categorias: cats.map(c => ({ id: c.id, nombre: c.name, descripcion: c.description }))
            };
        }
    }),
    
    obtener_lista_precios_por_categoria: tool({
        description: 'Obtiene los sub-servicios específicos y envía la lista de precios visual (imagen) de una categoría padre. Úsalo SIEMPRE que el cliente elija un área (ej. Depilación) para mostrarle los precios.',
        parameters: z.object({
            categoria_id: z.string().describe('El ID de la categoría padre obtenida previamente.')
        }),
        execute: async ({ categoria_id }) => {
            const catUrl = `/api/catalog-image?id=${categoria_id}`;
            res.write(`data: ${JSON.stringify({ media_url: catUrl })}\n\n`);
            
            const data = await getServicesByCategory(categoria_id);
            if (!data || !data.category) {
                return { error: "Categoría no encontrada" };
            }
            return {
                categoria: data.category.name,
                sub_servicios: data.services.map(s => ({
                    id: s.id,
                    nombre: s.name,
                    precio: s.price,
                    duracion: s.duration,
                    descripcion: s.description
                }))
            };
        }
    }),

    calcular_presupuesto: tool({
        description: 'Suma los precios de los sub-servicios seleccionados para darle al cliente un total final.',
        parameters: z.object({
            nombres_servicios: z.array(z.string()).describe('Lista con los nombres exactos de los sub-servicios elegidos.'),
            precios: z.array(z.number()).describe('Lista con los precios correspondientes a cada servicio elegidos.')
        }),
        execute: async ({ nombres_servicios, precios }) => {
            const total = precios.reduce((a, b) => a + b, 0);
            return {
                servicios: nombres_servicios,
                total_pagar: total,
                seña_requerida: total / 2,
                mensaje: "Presupuesto calculado correctamente."
            };
        }
    }),

    consultar_horarios_disponibles: tool({
        description: 'Busca horarios reales disponibles en la agenda de los profesionales para una categoría específica y una fecha determinada.',
        parameters: z.object({
            categoria_id: z.string().describe('El ID de la categoría (necesario para buscar al profesional correcto).'),
            fecha: z.string().describe('Fecha en formato YYYY-MM-DD.'),
            duracion_minutos: z.number().describe('Duración total estimada de los servicios elegidos en minutos.')
        }),
        execute: async ({ categoria_id, fecha, duracion_minutos }) => {
            const startDate = new Date(`${fecha}T00:00:00-03:00`);
            const endDate = new Date(`${fecha}T23:59:59-03:00`);
            const slots = await getAvailableSlotsFromDB(categoria_id, startDate, endDate, duracion_minutos);
            
            if (!slots || slots.length === 0) {
                return { mensaje: "No hay disponibilidad para esa fecha." };
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
                mensaje: "Horarios disponibles encontrados",
                turnos_disponibles: slots.map(formatSlot).slice(0, 10) // Retornar max 10 para no saturar contexto
            };
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
