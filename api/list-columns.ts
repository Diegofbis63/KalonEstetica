
import { db } from './_services/db.js';
import { sql as drizzleSql } from 'drizzle-orm';

export default async function handler(req, res) {
    let columns = {};
    try {
        const catCols = await db.execute(drizzleSql`SELECT column_name FROM information_schema.columns WHERE table_name = 'categories'`);
        const svcCols = await db.execute(drizzleSql`SELECT column_name FROM information_schema.columns WHERE table_name = 'services'`);
        columns = {
            categories: catCols.rows.map(r => r.column_name),
            services: svcCols.rows.map(r => r.column_name)
        };
    } catch (e) {
        columns = { error: e.message };
    }

    res.status(200).json(columns);
}
