import 'dotenv/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

async function test() {
    const apiKey = "***REMOVED***";
    console.log("Testing with key:", apiKey.substring(0, 10) + "...");
    
    const openrouter = createOpenAI({
        apiKey: apiKey.trim(),
        baseURL: 'https://openrouter.ai/api/v1',
    });

    try {
        const { text } = await generateText({
            model: openrouter('google/gemini-2.0-flash-001'),
            prompt: 'Di "Hola Antigravity" si esto funciona.',
        });
        console.log("Response:", text);
    } catch (err) {
        console.error("Error:", err);
    }
}

test();
