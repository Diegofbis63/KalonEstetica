
import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function alignWithNamingDictionary() {
    console.log("🔍 Auditando Nomenclatura KÂLON (Sync views with Dictionary)...");
    
    try {
        // 1. Re-deploy Views with EXACT naming from dictionary
        await sql`DROP VIEW IF EXISTS view_staff_full;`;
        await sql`DROP VIEW IF EXISTS view_system_metrics;`;
        await sql`DROP VIEW IF EXISTS view_category_performance;`;

        // view_staff_full: adheres to staff properties (id, name, phone, role)
        await sql`
            CREATE VIEW view_staff_full AS
            SELECT 
                id, 
                name, 
                phone, 
                role, 
                is_active, 
                work_start, 
                work_end,
                created_at,
                COALESCE(
                    (SELECT json_agg(category_id) 
                     FROM staff_specialties 
                     WHERE staff_id = s.id), 
                    '[]'
                ) as category_ids
            FROM staff s;
        `;

        // view_system_metrics: adheres to Dictionary Section 2 (completed)
        // includes support for legacy 'realizado'/'realizada' during transition
        await sql`
            CREATE VIEW view_system_metrics AS
            SELECT
                (SELECT count(*) FROM appointments) as total_appointments,
                (SELECT count(*) FROM leads) as total_leads,
                (SELECT count(*) FROM appointments WHERE date_time >= CURRENT_DATE) as new_today,
                (SELECT COALESCE(sum(total_price::numeric), 0) 
                 FROM appointments 
                 WHERE LOWER(status) IN ('completed', 'realizada', 'realizado')) as total_revenue
            FROM (SELECT 1) as dummy;
        `;

        // view_category_performance: Mapping category.name as parent_service if needed
        await sql`
            CREATE VIEW view_category_performance AS
            SELECT 
                c.id as category_id,
                c.name as category_name,
                c.target_income,
                COALESCE(sum(a.total_price::numeric), 0) as current_income,
                CASE 
                    WHEN c.target_income > 0 
                    THEN (COALESCE(sum(a.total_price::numeric), 0) / c.target_income) * 100 
                    ELSE 0 
                END as percentage
            FROM categories c
            LEFT JOIN appointments a ON a.category_id = c.id AND LOWER(a.status) IN ('completed', 'realizada', 'realizado')
            GROUP BY c.id, c.name, c.target_income;
        `;

        console.log("✅ Vistas sincronizadas con el Diccionario KÂLON.");
    } catch (e) {
        console.error("❌ Error en sincronización de nombres:", e);
    }
}

alignWithNamingDictionary();
