
import { streamText, convertToCoreMessages } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import * as dotenv from 'dotenv';
dotenv.config();

const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
});

const model = openrouter('google/gemini-2.0-flash-001');

const tools = {
    registrar_e_iniciar_catalogo: {
        description: 'Registra al cliente Y muestra el catálogo principal.',
        parameters: z.object({
            nombre_completo: z.string()
        }),
        execute: async (args: any) => {
            console.log('Tool ATOMIC Executing with:', args);
            return { 
                success: true, 
                leadId: 'test-id-123', 
                price_list_url: 'https://kalon-estetica.vercel.app/assets/centro-kalon-estetica--hRU61qu.png',
                categorias: [{id: '1', nombre: 'Cejas'}]
            };
        }
    }
};

async function test() {
    console.log('--- TESTING GEMINI 2.0 + PROTOCOL V6 ---');
    const result = streamText({
        model,
        system: 'Protocolo KÂLON V6: Si el usuario da su nombre, usa registrar_e_iniciar_catalogo.',
        messages: [{ role: 'user', content: 'Hola, soy Francisco' }],
        tools: tools as any,
        maxSteps: 5,
    });

    let hasSent = false;
    for await (const part of result.fullStream) {
        console.log('PART TYPE:', part.type);
        if (part.type === 'error') console.error('ERROR:', JSON.stringify(part.error, null, 2));
        if (part.type === 'tool-call') console.log('CALLING:', part.toolName);
        if (part.type === 'tool-result') console.log('RESULT RECEIVED');
        if (part.type === 'text-delta') hasSent = true;
    }
    console.log('Has sent content:', hasSent);
}

test();
