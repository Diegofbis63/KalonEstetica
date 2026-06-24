import { sql } from '../api/_services/db.ts';

async function run() {
    const s1 = await sql`SELECT id, title, price FROM services WHERE id = 'abce7761-a878-4a49-b285-5f2deb1de808'`;
    const s2 = await sql`SELECT id, title, price FROM services WHERE id = '0d5ea3b0-ea01-4115-a043-2e2488b1a826'`;
    console.log("Service 1:", s1);
    console.log("Service 2:", s2);

    // Let's search all services with name like 'Pack'
    const packs = await sql`SELECT id, title, price FROM services WHERE title ILIKE '%Pack%'`;
    console.log("\nPACK SERVICES:");
    packs.forEach((p: any) => console.log(`- ${p.id} [${p.title}] Price: ${p.price}`));

    // Search services like Laminado
    const laminados = await sql`SELECT id, title, price FROM services WHERE title ILIKE '%Laminado%'`;
    console.log("\nLAMINADO SERVICES:");
    laminados.forEach((l: any) => console.log(`- ${l.id} [${l.title}] Price: ${l.price}`));

    process.exit(0);
}

run().catch(console.error);
