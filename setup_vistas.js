
import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function optimizeDB() {
    console.log("🚀 Desplegando Cerebro en Neon (Views & Functions)...");
    
    try {
        await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS target_income numeric(10,2) DEFAULT 0;`;

        // 1. Drop existing if it exists
        await sql`DROP VIEW IF EXISTS view_staff_full;`;
        await sql`DROP VIEW IF EXISTS view_system_metrics;`;
        await sql`DROP VIEW IF EXISTS view_category_performance;`;

        // 2. View: Staff with Specialties pre-aggregated
        await sql`
            CREATE VIEW view_staff_full AS
            SELECT 
                s.*,
                COALESCE(
                    (SELECT json_agg(category_id) 
                     FROM staff_specialties 
                     WHERE staff_id = s.id), 
                    '[]'
                ) as category_ids
            FROM staff s;
        `;

        // 3. View: Dashboard Stats
        await sql`
            CREATE VIEW view_system_metrics AS
            SELECT
                (SELECT count(*) FROM appointments) as total_appointments,
                (SELECT count(*) FROM leads) as total_leads,
                (SELECT count(*) FROM appointments WHERE date_time >= CURRENT_DATE) as new_today,
                (SELECT COALESCE(sum(total_price), 0) FROM appointments WHERE status = 'realizado') as total_revenue
            FROM (SELECT 1) as dummy;
        `;

        // 4. View: Category income vs Target
        await sql`
            CREATE VIEW view_category_performance AS
            SELECT 
                c.id as category_id,
                c.name as category_name,
                c.target_income,
                COALESCE(sum(a.total_price), 0) as current_income,
                CASE 
                    WHEN c.target_income > 0 
                    THEN (COALESCE(sum(a.total_price), 0) / c.target_income) * 100 
                    ELSE 0 
                END as percentage
            FROM categories c
            LEFT JOIN appointments a ON a.category_id = c.id AND a.status = 'realizado'
            GROUP BY c.id, c.name, c.target_income;
        `;

        console.log("✅ Views desplegadas con éxito.");
    } catch (e) {
        console.error("❌ Error en optimización DB:", e);
    }
}

optimizeDB();
