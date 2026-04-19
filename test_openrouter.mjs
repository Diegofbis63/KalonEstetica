import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const key = process.env.OPENROUTER_API_KEY;
    const openrouter = createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: key,
        headers: {
            'HTTP-Referer': 'https://kalon-estetica.vercel.app',
            'X-Title': 'Kalon Estética Chatbot',
        },
    });

    console.log("=== TEST con maxTokens: 2048 ===\n");
    try {
        const result = streamText({
            model: openrouter('google/gemini-2.0-flash-001'),
            messages: [{ role: 'user', content: 'Hola, soy Maria Lopez' }],
            maxTokens: 2048,
        });
        let text = "";
        for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
                text += part.textDelta;
                process.stdout.write(part.textDelta);
            } else if (part.type === 'error') {
                console.log("\nERROR:", JSON.stringify(part.error?.data || part.error));
            }
        }
        console.log("\n\n" + (text ? "✅ FUNCIONA - " + text.length + " chars" : "❌ NO GENERÓ TEXTO"));
    } catch(e) { console.error("EXCEPTION:", e.message); }
}
main();
