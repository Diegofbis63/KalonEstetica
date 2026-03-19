
import { db } from './api/_services/db.js';
import { services } from './api/_services/schema.js';
(async () => {
    const res = await db.select().from(services);
    console.log('SERVICES_BODY_START');
    console.log(JSON.stringify(res));
    console.log('SERVICES_BODY_END');
    process.exit(0);
})();
