
import { db } from './api/_services/db.js';
import * as schema from './api/_services/schema.js';
import { asc, desc } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testAdminLogic() {
    const catType = 'categories';
    const table = schema.categories;
    
    const findOptions: any = {
        orderBy: []
    };

    if ((table as any).sort_order) {
        findOptions.orderBy.push(asc((table as any).sort_order));
    }

    findOptions.with = { services: true };

    try {
        const results = await (db.query as any)[catType].findMany(findOptions);
        console.log("Results length:", results.length);
        if (results.length > 0) {
            console.log("First result:", results[0].name);
        }
    } catch (e) {
        console.error("Logic Error:", e);
    }
}

testAdminLogic();
