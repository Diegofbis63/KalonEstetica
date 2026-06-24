import { sql } from '../api/_services/db.ts';

async function run() {
    try {
        console.log("Checking columns of table 'appointments'...");
        const columns = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'appointments'
        `;
        const colNames = columns.map((c: any) => c.column_name);

        if (!colNames.includes('notes')) {
            console.log("Adding column 'notes' to 'appointments' table...");
            await sql`ALTER TABLE appointments ADD COLUMN notes TEXT`;
            console.log("Added 'notes' successfully.");
        }

        console.log("Re-checking columns of table 'appointments'...");
        const newColumns = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'appointments'
        `;
        console.log("New columns in DB:", newColumns.map((c: any) => `${c.column_name} (${c.data_type})`));

    } catch (e: any) {
        console.error("Migration helper failed:", e);
    }
    process.exit(0);
}

run().catch(console.error);
