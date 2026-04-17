
import { db } from './_services/db.js';
import { sql as drizzleSql } from 'drizzle-orm';

export default async function handler(req, res) {
    const results = [];
    try {
        // Fix Categories
        try {
            await db.execute(drizzleSql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS price_list_url TEXT`);
            results.push("Added price_list_url to categories");
        } catch (e) { results.push("Error categories: " + e.message); }

        // Fix Services
        try {
            await db.execute(drizzleSql`ALTER TABLE services ADD COLUMN IF NOT EXISTS sessions INTEGER DEFAULT 1`);
            results.push("Added sessions to services");
        } catch (e) { results.push("Error services: " + e.message); }

    } catch (e) {
        results.push("Main Error: " + e.message);
    }

    res.status(200).json({ results });
}
