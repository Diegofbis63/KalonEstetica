import { getActiveServices } from './api/_services/db.js';
import { getCategories } from './api/_services/db.js';

async function check() {
    const services = await getActiveServices();
    const pestanas = services.find(s => s.title.toLowerCase().includes('pestaña'));
    console.log('--- SERVICIOS PESTAÑAS ---');
    console.log(JSON.stringify(pestanas, null, 2));
    
    const categories = await getCategories();
    const pestanasCat = categories.find(c => c.name.toLowerCase().includes('pestaña'));
    console.log('--- CATEGORIA PESTAÑAS ---');
    console.log(JSON.stringify(pestanasCat, null, 2));
}

check().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
