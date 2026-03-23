import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });

import { buildTools } from '../api/_services/ai_tools.js';

const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
const model = google('gemini-2.5-flash');

async function test() {
    console.log("Starting streamText...");
    const result = streamText({
        model,
        messages: [{ role: 'user', content: '¿Cuáles son los servicios y categorías que ofrecen en Kalon Estetica? Listalos, por favor.' }],
        tools: buildTools('test-lead', 'kalon-estetica'),
        maxSteps: 5,
        onStepFinish: (step) => {
            console.log(`\n[STEP FINISHED] Type: ${step.stepType}`);
            if (step.toolCalls?.length) {
                console.log(`[TOOLS] Called: ${step.toolCalls.map(tc => tc.toolName).join(', ')}`);
            }
        }
    });

    for await (const text of result.textStream) {
        process.stdout.write(text);
    }
    
    console.log("\n\n--- DONE ---");
    
    // Wait to see if any background process continues (it shouldn't)
}

test().catch(console.error);
