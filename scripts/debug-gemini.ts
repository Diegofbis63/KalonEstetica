import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.production' });

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
});

async function test() {
    console.log("--- TEST GEMINI START ---");
    console.log("Key present:", !!process.env.GOOGLE_GENERATIVE_AI_API_KEY);
    
    try {
        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            prompt: 'Hola, di "Conexión exitosa" si puedes leerme.',
        });
        console.log("RESULT:", text);
    } catch (e: any) {
        console.error("FAILED WITH ERROR:");
        console.error(e);
        if (e.data) console.error("RAW DATA:", JSON.stringify(e.data, null, 2));
    }
}

test();
