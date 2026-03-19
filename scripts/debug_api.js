
import { db, sql } from '../api/_services/db.ts';
import * as schema from '../api/_services/schema.ts';
import { desc } from 'drizzle-orm';

async function check() {
    try {
        const result = await sql`SELECT * FROM view_system_metrics`;
        const metrics = result[0];
        
        const appointments = await db.query.appointments.findMany({
            orderBy: [desc(schema.appointments.date_time)],
            limit: 20,
            with: { lead: true, category: true }
        });

        const leads = await db.query.leads.findMany({
            orderBy: [desc(schema.leads.updated_at)],
            limit: 10
        });

        const response = { 
            stats: {
                 totalAppointments: metrics?.total_appointments || 0,
                 totalUsers: metrics?.total_leads || 0,
                 newToday: metrics?.new_today || 0,
                 total_revenue: metrics?.total_revenue || 0
            },
            appointments: appointments.map(a => ({
                ...a,
                client_name: a.lead?.client_name,
                phone: a.lead?.contact_info?.phone,
                category_name: a.category?.name
            })),
            leads: leads.map(l => ({
               ...l,
               phone: l.contact_info?.phone
            }))
        };
        
        console.log('--- RESPONSE SIMULATION ---');
        console.log('Appointments Count:', response.appointments.length);
        console.log('Leads Count:', response.leads.length);
        console.log('Stats:', response.stats);
        
    } catch (e) {
        console.error('ERROR:', e);
    }
}

check();
