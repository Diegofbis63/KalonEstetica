import 'dotenv/config';
import { db } from '../api/_services/db.js';
import { business_config } from '../api/_services/schema.js';

async function checkConfig() {
    try {
        const results = await db.select().from(business_config);
        console.log(`Found ${results.length} config keys.`);
        for (const item of results) {
            console.log(`Key: ${item.key}`);
            console.log(`  Length: ${item.value?.length || 0}`);
            console.log(`  Preview: ${item.value?.substring(0, 100)}...`);
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkConfig();
