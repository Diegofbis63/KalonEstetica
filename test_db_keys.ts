
import { db } from './api/_services/db.js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testDBKeys() {
    if (!db) {
        console.error("DB is null");
        return;
    }
    console.log("DB Query keys:", Object.keys(db.query));
}

testDBKeys();
