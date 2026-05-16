import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  try {
    const cats = await sql`SELECT id, name FROM categories`;
    console.log('Categories:', cats);
    
    const staff = await sql`SELECT id, name, work_start, work_end FROM staff`;
    console.log('Staff:', staff);
    
    const specialties = await sql`SELECT staff_id, category_id FROM staff_specialties`;
    console.log('Specialties:', specialties);

    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() + 1);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(20, 0, 0, 0);

    if (cats.length > 0) {
        console.log(`Checking slots for category ${cats[0].name} (${cats[0].id}) between ${start.toISOString()} and ${end.toISOString()}`);
        const slots = await sql`SELECT * FROM get_available_slots(${cats[0].id}, ${start.toISOString()}, ${end.toISOString()}, 30)`;
        console.log('Slots found:', slots);
    }
  } catch (err) {
    console.error(err);
  }
}

main();
