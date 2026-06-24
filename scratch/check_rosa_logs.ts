import { sql } from '../api/_services/db.ts';

async function run() {
    const logs = await sql`SELECT role, content, created_at FROM chat_logs WHERE lead_id = '04e27047-a2ba-4add-916b-b2bb6ca05580' ORDER BY created_at ASC`;
    console.log("ROSA CHAT LOGS:");
    logs.forEach((l: any) => console.log(`[${l.created_at}] [${l.role}] ${l.content}`));
    process.exit(0);
}

run().catch(console.error);
