
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import * as dotenv from 'dotenv';
dotenv.config();

const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
});

const model = openrouter('google/gemini-2.0-flash-001');

// Mock tools for testing flow
const tools = {
    registrar_e_iniciar_catalogo: {
        description: 'Registra al cliente Y muestra el catálogo principal.',
        parameters: z.object({ nombre_completo: z.string() }),
        execute: async (args: any) => {
            console.log('--- TOOL EXEC: registrar_e_iniciar_catalogo ---', args);
            return { 
                success: true, 
                leadId: 'lead_123', 
                price_list_url: 'https://kalon-estetica.vercel.app/catalog.png',
                categorias: [{id: 'cat_uñas', nombre: 'Uñas'}, {id: 'cat_cejas', nombre: 'Cejas'}]
            };
        }
    },
    consultar_servicios: {
        description: 'Obtiene detalles de servicios. Pasá un array de categorías.',
        parameters: z.object({ categorias: z.array(z.string()) }),
        execute: async (args: any) => {
            console.log('--- TOOL EXEC: consultar_servicios ---', args);
            return {
                success: true,
                catalogs: [{
                    categoria: 'Uñas',
                    servicios: [{id: 'serv_1', nombre: 'Esculpidas', precio: 5000}]
                }]
            };
        }
    },
    consultar_disponibilidad: {
        description: 'Busca horarios disponibles.',
        parameters: z.object({ serviceIds: z.array(z.string()), fecha: z.string() }),
        execute: async (args: any) => {
            console.log('--- TOOL EXEC: consultar_disponibilidad ---', args);
            return { disponible: true, horarios: [{hora: '14:00', label: '14:00 con Maria'}] };
        }
    }
};

const SYSTEM_PROMPT = `
Eres KÂLON (v6.0).
### REGLAS:
1. Si el usuario se identifica con su nombre, llama a registrar_e_iniciar_catalogo IMMEDIATAMENTE.
2. Si el usuario menciona una categoría (ej: "uñas", "cejas", "pestañas"), llama a consultar_servicios con esa categoría en un array.
3. No des precios de memoria, bscalos con las herramientas.
`;

async function runScenario(messages: any[]) {
    console.log('\n>> USER:', messages[messages.length - 1].content);
    const result = streamText({
        model,
        system: SYSTEM_PROMPT,
        messages,
        tools: tools as any,
        maxSteps: 5,
        maxTokens: 400,
    });

    let fullText = "";
    for await (const part of result.fullStream) {
        if (part.type === 'text-delta') fullText += part.textDelta;
        if (part.type === 'tool-call') console.log('   CALLING:', part.toolName, part.args);
    }
    console.log('<< BOT:', fullText);
    return fullText;
}

async function main() {
    const messages: any[] = [];
    
    // TURN 1: Identificación
    messages.push({ role: 'user', content: 'Hola! Soy Roberto' });
    await runScenario(messages);
    messages.push({ role: 'assistant', content: '¡Hola Roberto! Ya te registré y te adjunto el catálogo.' });

    // TURN 2: Selección de categoría
    messages.push({ role: 'user', content: 'Me interesan las uñas' });
    await runScenario(messages);
}

main().catch(console.error);
