import { sql } from '../api/_services/db';

async function check() {
    const r = await sql`
        SELECT id, title, price, category_id 
        FROM services 
        WHERE title ILIKE '%pierna completa%' 
           OR title ILIKE '%limpieza facial%'
    `;
    console.log(JSON.stringify(r, null, 2));
}

check().catch(console.error);
