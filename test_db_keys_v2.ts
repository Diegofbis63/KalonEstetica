
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Now import db
const { db } = await import('./api/_services/db.js');

async function testDBKeys() {
    if (!db) {
        console.error("DB is still null. connectionString might be missing even with dotenv.");
        return;
    }
    console.log("DB Query keys:", Object.keys(db.query));
}

testDBKeys();
