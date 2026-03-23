import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    console.log("Starting test-ai.js...");
    try {
        const result = streamText({
            model: google('gemini-2.5-flash'),
            messages: [{ role: 'user', content: '¿Qué servicios ofrecen?' }],
            tools: {
                consultar_servicios: {
                    description: 'Busca servicios en el catálogo',
                    parameters: { type: 'object', properties: {} },
                    execute: async () => [{ id: 1, name: 'Manicura' }]
                }
            }
        });

        console.log("Stream object created. Iterating fullStream...");
        for await (const part of result.fullStream) {
            console.log("Stream part:", part.type, JSON.stringify(part));
        }
        console.log("Iteration completed normally.");
    } catch(e) {
        console.error("CAUGHT EXCEPTION:", e);
    }
}
main();
