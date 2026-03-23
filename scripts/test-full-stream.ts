import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { streamText } from 'ai';

async function test() {
    // Dynamic imports to ensure dotenv.config() runs first
    const { getKalonModel } = await import('../api/_services/ai.js');
    const { buildTools } = await import('../api/_services/ai_tools.js');
    const { sql } = await import('../api/_services/db.js');

    console.log("Applying DB Schema Fixes (Defaults)...");
    try {
        await sql`ALTER TABLE leads ALTER COLUMN is_bot_enabled SET DEFAULT true;`;
        await sql`ALTER TABLE leads ALTER COLUMN chat_history SET DEFAULT '[]'::jsonb;`;
        console.log("DB Schema Fixes Applied Successfully.");
    } catch (e) {
        console.warn("Schema fix warning (might already be fixed):", e);
    }

    const model = getKalonModel();

    console.log("Starting streamText with OpenRouter (v6 compatible)...");
    const result = streamText({
        model,
        messages: [{ role: 'user', content: 'Hola, soy Fede y me gustaría una limpieza de cutis. ¿Qué opciones hay?' }],
        tools: buildTools(null, 'kalon-estetica'), // leadId null to trigger registrar_cliente
        maxSteps: 5,
    });

    for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
            process.stdout.write((part as any).text || (part as any).textDelta || '');
        } else if (part.type === 'tool-call') {
            const argsStr = JSON.stringify((part as any).args);
            console.log(`\n[TOOL CALL]: ${(part as any).toolName} -> ${argsStr}`);
        } else if (part.type === 'tool-result') {
            console.log(`\n[TOOL RESULT]: ${(part as any).toolName}`);
        } else if (part.type === 'finish') {
            console.log(`\n[FINISH]: ${(part as any).finishReason}`);
        } else if (part.type === 'error') {
            console.error(`\n[ERROR]:`, (part as any).error);
        }
    }
    
    console.log("\n\n--- TEST COMPLETE ---");
}

test().catch(console.error);
