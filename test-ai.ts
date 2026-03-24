import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import dotenv from 'dotenv';

async function test() {
    const apiKey = "***REMOVED***";
    
    const openrouter = createOpenAI({
        apiKey: apiKey.trim(),
        baseURL: 'https://openrouter.ai/api/v1',
    });

    try {
        console.log("Testing OpenRouter with Gemini 2.0 Flash...");
        const { text } = await generateText({
            model: openrouter('google/gemini-2.0-flash-001'),
            prompt: 'Hola, di "Conexión Exitosa" si puedes leerme.',
        });
        console.log("Response:", text);
    } catch (err: any) {
        console.error("Full Error Object:", JSON.stringify(err, null, 2));
        console.error("Error Message:", err.message);
        if (err.data) console.error("Error Data:", JSON.stringify(err.data, null, 2));
    }
}

test();
