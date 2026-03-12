import pg from 'pg';
import bcrypt from 'bcrypt';
import { readFileSync } from 'fs';
import { parse } from 'dotenv';

const envConfig = parse(readFileSync('.env.local'));
for (const k in envConfig) {
    process.env[k] = envConfig[k];
}

const { Client } = pg;
const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    await client.connect();
    console.log('--- Configurando RBAC KÂLON ---');

    await client.query(`
        ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE;
        ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'staff';
        
        -- Add category_id to leads and appointments for easier RBAC
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
        ALTER TABLE appointments ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

        -- Ensure categories has organization_id if needed, though not strictly required now
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS organization_id UUID;
    `);
    
    // 2. Populate category_id from existing service_type
    console.log('Migrando datos de categorías...');
    await client.query(`
        UPDATE appointments a
        SET category_id = s.category_id
        FROM services s
        WHERE a.service_type = s.title AND a.category_id IS NULL;
        
        UPDATE leads l
        SET category_id = a.category_id
        FROM appointments a
        WHERE a.lead_id = l.id AND l.category_id IS NULL;
    `);

    // 2. Crear tabla permissions
    await client.query(`
        CREATE TABLE IF NOT EXISTS user_permissions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
            category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
            UNIQUE(user_id, category_id)
        );
    `);

    // 3. Helper function to create/update user
    const upsertUser = async (username, email, password, role) => {
        const hash = await bcrypt.hash(password, 10);
        const res = await client.query(`
            INSERT INTO admin_users (username, email, password_hash, role)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (username) DO UPDATE SET
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role,
                email = EXCLUDED.email
            RETURNING id;
        `, [username, email, hash, role]);
        return res.rows[0].id;
    };

    // 4. Seeding Users
    console.log('Sembrando usuarios...');
    const adminId = await upsertUser('gabriela_adm_x79', 'info@kalon.com', 'Kalon.Gaby!2026#Sec', 'admin');
    const monicaId = await upsertUser('monica_staff_p24', 'monica@kalon.com', 'Mon#PestUñas!24', 'staff');
    const sofiaId = await upsertUser('sofia_staff_m88', 'sofia@kalon.com', 'Sof$MasCorp!88', 'staff');
    const lauraId = await upsertUser('laura_staff_d15', 'laura@kalon.com', 'Lau%CejDep!15', 'staff');

    // 5. Seeding Permissions
    console.log('Configurando permisos...');
    
    const categoriesRes = await client.query('SELECT id, name FROM categories');
    const cats = {};
    categoriesRes.rows.forEach(r => cats[r.name] = r.id);

    const setPermissions = async (userId, catNames) => {
        // Clear existing
        await client.query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);
        // Insert new
        for (const name of catNames) {
            const catId = cats[name] || cats[name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")]; // Handle accents
            if (catId) {
                await client.query('INSERT INTO user_permissions (user_id, category_id) VALUES ($1, $2)', [userId, catId]);
            } else {
                console.warn(`Categoría no encontrada: ${name}`);
            }
        }
    };

    await setPermissions(adminId, []); // Admin doesn't need specific permissions in this table (logic will handle it)
    await setPermissions(monicaId, ['Pestañas', 'Uñas']);
    await setPermissions(sofiaId, ['Masajes', 'Corporal', 'Facial']);
    await setPermissions(lauraId, ['Cejas', 'Depilacion']);

    console.log('✅ Sistema RBAC configurado y usuarios sembrados.');
    await client.end();
}

main().catch(error => {
    console.error('❌ Error en setup RBAC:', error);
    process.exit(1);
});
