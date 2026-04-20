
import { streamText, convertToCoreMessages } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import * as dotenv from 'dotenv';
dotenv.config();

const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
});

const model = openrouter('openai/gpt-4o-mini');

const tools = {
    registrar_cliente: {
        description: 'Registra al cliente.',
        parameters: z.object({
            nombre: z.string().optional(),
            apellido: z.string().optional(),
            nombre_completo: z.string().optional()
        }),
        execute: async (args) => {
            console.log('Tool Executing with:', args);
            return { success: true, leadId: 'test-id', message: '¡Perfecto! Ya te registré.' };
        }
    }
};

async function test() {
    console.log('--- TESTING AI STREAM ---');
    const result = streamText({
        model,
        system: 'Pide nombre y usa registrar_cliente',
        messages: [{ role: 'user', content: 'Soy Gisella Frustia' }],
        tools: tools as any,
        maxSteps: 5,
        maxTokens: 500,
    });

    let hasSent = false;
    for await (const part of result.fullStream) {
        console.log('PART TYPE:', part.type);
        if (part.type === 'error') console.error('ERROR DATA:', part.error);
        if (part.type === 'text-delta') hasSent = true;
        if (part.type === 'tool-result') hasSent = true;
    }
    console.log('Has sent content:', hasSent);
}

test();
