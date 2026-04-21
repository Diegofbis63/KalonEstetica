
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
function getKalonSystemPrompt(date: string) {
    return `Protocolo KÂLON V6. Fecha: ${date}. Si el usuario da su nombre, usa registrar_e_iniciar_catalogo. Si pide una categoría, usa mostrar_servicios_categoria.`;
}

function buildTools() {
    return {
        registrar_e_iniciar_catalogo: {
            description: 'Registra al cliente Y muestra el catálogo principal.',
            parameters: z.object({
                nombre_completo: z.string()
            }),
            execute: async (args: any) => {
                return { 
                    success: true, 
                    leadId: 'test-id-123', 
                    price_list_url: 'https://kalon-estetica.vercel.app/assets/centro-kalon-estetica--hRU61qu.png',
                    categorias: [{id: '1', nombre: 'Cejas'}, {id: '2', nombre: 'Uñas'}]
                };
            }
        },
        mostrar_servicios_categoria: {
            description: 'Muestra los servicios de una categoría específica.',
            parameters: z.object({
                categoria_id: z.string()
            }),
            execute: async (args: any) => {
                return {
                    success: true,
                    servicios: [{id: '101', nombre: 'Manicura Rusa', precio: 500}]
                };
            }
        }
    };
}

async function test() {
    console.log('--- TESTING GEMINI 2.0 + PROTOCOL V6 ---');
    const result = await streamText({
      model: openrouter('google/gemini-2.0-flash-001'),
      system: getKalonSystemPrompt(new Date().toISOString()),
      messages: [
        { role: 'user', content: 'Hola, soy Francisco' }
      ],
      tools: buildTools(),
      maxTokens: 1000,
      temperature: 0,
    });

    console.log('--- STAGE 1: REGISTRATION ---');
    for await (const part of result.fullStream) {
      if (part.type === 'tool-result') {
        console.log('TOOL RESULT:', JSON.stringify(part.result, null, 2));
      }
      if (part.type === 'text-delta') {
        process.stdout.write(part.textDelta);
      }
    }
    console.log('\n\n--- STAGE 2: CATEGORY EXPLORATION ---');
    const result2 = await streamText({
      model: openrouter('google/gemini-2.0-flash-001'),
      system: getKalonSystemPrompt(new Date().toISOString()),
      messages: [
        { role: 'user', content: 'Hola, soy Francisco' },
        { role: 'assistant', content: '¡Hola Francisco! Ya te registré. Acá tenés nuestro catálogo: [Imagen]' },
        { role: 'user', content: 'Quiero ver los servicios de Uñas' }
      ],
      tools: buildTools(),
      maxTokens: 1000,
      temperature: 0,
    });

    for await (const part of result2.fullStream) {
      if (part.type === 'tool-result') {
        console.log('TOOL RESULT:', JSON.stringify(part.result, null, 2));
      }
      if (part.type === 'text-delta') {
        process.stdout.write(part.textDelta);
      }
    }
}

test();
