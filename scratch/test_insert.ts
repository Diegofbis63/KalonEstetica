import { db } from '../api/_services/db.ts';
import * as schema from '../api/_services/schema.ts';

async function run() {
    try {
        console.log("Simulating appointment insert...");
        const result = await db.insert(schema.appointments).values({
            lead_id: '04e27047-a2ba-4add-916b-b2bb6ca05580', // Rosa Vivero ID
            staff_id: '1850123d-be4f-42a8-b6e4-12fc15615b50', // Gabriela ID
            date_time: new Date('2026-06-22T16:00:00Z'),
            service_type: 'Radiofrecuencia Tripolar Facial + Reflexología Podal',
            category_id: null,
            status: 'pending',
            total_price: 30000 as any, // Try passing number first
            total_duration: 90,
            selected_services: [{ id: 'f31aecaa-8f30-42e6-bfaa-e1decddba28f' }, { id: '6faa549b-4e9a-4683-8df1-6cd44f0375d1' }]
        }).returning();
        console.log("Insert success!", JSON.stringify(result, null, 2));
    } catch (e: any) {
        console.error("INSERT FAILED WITH ERROR:", e);
    }
    process.exit(0);
}

run().catch(console.error);
