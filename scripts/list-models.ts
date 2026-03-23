import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.production' });

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
});

async function list() {
    let resultLog = "--- AI-SDK MODEL AUDIT START ---\\n";
    const models = [
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-pro',
        'gemini-1.0-pro',
        'gemini-2.0-flash-exp',
        'gemini-2.0-flash-lite-preview-02-05'
    ];
    
    for (const m of models) {
        try {
            const { text } = await generateText({
                model: google(m),
                prompt: 'Hi',
            });
            resultLog += `✅ ${m} works!\\n`;
        } catch (e: any) {
            resultLog += `❌ ${m} fails: ${e.message}\\n`;
        }
    }
    fs.writeFileSync('scripts/audit_raw.txt', resultLog);
}

list();
