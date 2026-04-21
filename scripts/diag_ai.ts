import { streamText } from 'ai';
import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai';
import dotenv from 'dotenv';
import { getKalonSystemPrompt } from '../api/_services/prompts.js';

dotenv.config();

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

const model = openrouter('google/gemini-2.0-flash-001');

function buildTools() {
    return {
        registrar_e_iniciar_catalogo: {
            description: 'Registra al cliente Y muestra el catálogo principal.',
            parameters: z.object({
                nombre_completo: z.string()
            }),
            execute: async (args: any) => {
                console.log('\n[TOOL CALL] registrar_e_iniciar_catalogo:', args);
                return { 
                    success: true, 
                    leadId: 'test-id-123', 
                    price_list_url: 'https://images.unsplash.com/photo-1560750588-73207b1ef5b8',
                    categorias: [{id: '1', nombre: 'Pestañas ✨'}, {id: '2', nombre: 'Uñas 💅'}]
                };
            }
        }
    };
}

async function test() {
    console.log('--- STARTING STAGE 1 MODULAR TEST (v7.2) ---');
    try {
        const result = await streamText({
            model,
            system: getKalonSystemPrompt(new Date().toISOString()),
            messages: [{ role: 'user', content: 'Hola, soy Estefanía Juares' }],
            tools: buildTools() as any,
            maxSteps: 5,
        });

        console.log('BOT RESPONSE:');
        for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
                process.stdout.write(part.textDelta);
            }
            if (part.type === 'tool-result') {
                console.log('\n[TOOL RESULT RECEIVED]');
            }
        }
        console.log('\n--- TEST FINISHED ---');
    } catch (error) {
        console.error('--- TEST FAILED ---');
        console.error(error);
    }
}

test();
