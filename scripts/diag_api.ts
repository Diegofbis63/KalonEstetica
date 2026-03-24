import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import * as dotenv from 'dotenv';

dotenv.config();

const rawKey = process.env.OPENROUTER_API_KEY;
console.log("Key found:", !!rawKey);

const openrouter = createOpenAI({
    apiKey: rawKey?.trim(),
    baseURL: 'https://openrouter.ai/api/v1',
    compatibility: 'compatible' as any,
    fetch: async (url, options) => {
        console.log("SDK CALLING URL:", url);
        return fetch(url, options);
    }
});

async function runDiag() {
    console.log("Starting test with google/gemini-2.0-flash-001...");
    try {
        const result = await streamText({
            model: openrouter('google/gemini-2.0-flash-001'),
            system: 'Sos un asistente que ayuda a probar APIs. Saludá con "API OK" y usá la herramienta "test_tool" si te pregunto por el clima.',
            messages: [{ role: 'user', content: '¿Cómo está el clima?' }],
            tools: {
                test_tool: {
                    description: 'Prueba de herramienta',
                    parameters: {
                        type: 'object',
                        properties: {
                            city: { type: 'string' }
                        }
                    },
                    execute: async ({ city }) => {
                        console.log("TOOL CALLED FOR:", city);
                        return `Clima en ${city}: Soleado`;
                    }
                }
            },
            maxSteps: 5,
        });

        let full = "";
        for await (const text of result.textStream) {
            console.log("PART:", text);
            full += text;
        }
        console.log("FINISH. Total length:", full.length);
    } catch (err: any) {
        console.error("FATAL DIAG ERROR:", err);
        if (err.data) console.error("Error Data:", JSON.stringify(err.data, null, 2));
    }
}

runDiag();
