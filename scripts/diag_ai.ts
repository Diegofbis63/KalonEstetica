import { generateText } from 'ai';
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

function buildTestTools() {
    return {
        registrar_e_iniciar_catalogo: {
            description: 'ETAPA INICIAL: Registra al cliente Y muestra el catálogo principal en un solo paso. USAR CUANDO EL USUARIO DA SU NOMBRE.',
            parameters: z.object({
                nombre_completo: z.string().describe('Nombre y apellido del cliente')
            }),
            execute: async (args: any) => {
                console.log('\n[TOOL CALL EXECUTED] registrar_e_iniciar_catalogo:', args);
                return { 
                    success: true, 
                    leadId: 'test-id-123', 
                    client_name: args.nombre_completo,
                    price_list_url: 'https://kalon-estetica.vercel.app/template_chatbot.png',
                    instruction: "IMPORTANTE: Responde ÚNICAMENTE con un saludo y bienvenida. La imagen con el catálogo de servicios YA SE ENVIÓ. No tienes que hacer NADA MÁS. DALE LA BIENVENIDA Y ESPERA SU RESPUESTA."
                };
            }
        },
        consultar_servicios: {
            description: 'Obtiene detalles y catálogo visual de servicios. SIEMPRE pasá un array de categorías.',
            parameters: z.object({
                categorias: z.array(z.string()).describe('Lista de nombres de categorías o UUIDs')
            }),
            execute: async (args: any) => {
                console.log('\n[TOOL CALL EXECUTED] consultar_servicios:', args);
                return {
                    success: true,
                    catalogs: [
                        {
                            categoria: 'Pestañas ✨',
                            servicios: [
                                { id: 's1', nombre: 'Clásicas', precio: 2500, description: "Un look natural" },
                                { id: 's2', nombre: 'Volumen Ruso', precio: 4500, description: "Mirada impactante" }
                            ],
                            price_list_url: 'https://example.com/pestanas.png'
                        }
                    ]
                };
            }
        }
    };
}

async function runScenario(name: string, messages: any[]) {
    console.log(`\n=== SCENARIO START: ${name} ===`);
    try {
        const result = await generateText({
            model,
            system: getKalonSystemPrompt(new Date().toISOString()),
            messages,
            tools: buildTestTools() as any,
            maxSteps: 5,
        });

        console.log('--- BOT FINAL TEXT ---');
        console.log(result.text || "(No Text)");
        
        console.log('--- STEP SUMMARY ---');
        result.steps.forEach((step, i) => {
            console.log(`Step ${i}: ${step.toolCalls.length} tool calls, ${step.text ? "Text present" : "No text"}`);
            step.toolCalls.forEach(tc => console.log(`  - Call: ${tc.toolName}`));
        });
        
        return result;
    } catch (error: any) {
        console.error('--- SCENARIO FAILED ---', error.message);
        console.error(error);
    }
}

async function startSimulation() {
    await runScenario('Stage 2: Category Match', [
        { role: 'user', content: 'Hola, soy Maria Gomez' },
        { 
            role: 'assistant', 
            content: [
                { type: 'text', text: '¡Bienvenida Maria! Te muestro el catálogo.' },
                { type: 'tool-call', toolCallId: 'call_1', toolName: 'registrar_e_iniciar_catalogo', args: { nombre_completo: 'Maria Gomez' } }
            ] 
        },
        { 
            role: 'tool', 
            content: [
                { type: 'tool-result', toolCallId: 'call_1', toolName: 'registrar_e_iniciar_catalogo', result: { success: true, leadId: '123', price_list_url: '...', instruction: '...' } }
            ] 
        },
        { role: 'user', content: 'Me interesan las pestañas' }
    ]);
}

startSimulation();
