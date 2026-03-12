import { Pool } from '@neondatabase/serverless';

let pool: Pool;

export function getDb() {
    if (!pool) {
        const connString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
        if (!connString) {
            throw new Error("Missing DATABASE_URL");
        }

        pool = new Pool({
            connectionString: connString,
        });
    }
    return pool;
}
