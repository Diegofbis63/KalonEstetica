
import { db } from './_services/db.js';

export default async function handler(req, res) {
    let errorDetails = null;
    let data = null;
    try {
        data = await db.query.categories.findMany();
    } catch (e) {
        errorDetails = {
            message: e.message,
            name: e.name,
            stack: e.stack,
            code: e.code,
            hint: e.hint,
            detail: e.detail
        };
    }

    res.status(200).json({
        data,
        errorDetails
    });
}
