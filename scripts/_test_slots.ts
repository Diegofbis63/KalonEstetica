import { config } from 'dotenv';
config({ path: '.env.local' });
import { getAvailableSlotsFromDB } from '../api/_services/db.js';

async function run() {
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);
    const slots = await getAvailableSlotsFromDB("1", startDate, endDate, 30).catch(e => console.error(e));
    console.log("Slots:", slots);
}
run();
