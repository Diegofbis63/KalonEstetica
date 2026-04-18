import 'dotenv/config';
import { generateText, tool } from 'ai';
import { getKalonModel, getSystemPrompt } from '../api/_services/ai.js';
import { z } from 'zod';

// MOCK DE ESTADO Y HERRAMIENTAS
let cart: any[] = [];

const mockTools = {
    registrar_cliente: tool({
        description: 'Registra un nuevo cliente',
        parameters: z.object({ nombre: z.string(), apellido: z.string() }),
        execute: async ({ nombre, apellido }) => ({ success: true, leadId: 'mock-123', nombre: `${nombre} ${apellido}` })
    }),
    listar_categorias_principales: tool({
        description: 'Lista las categorías de servicios',
        parameters: z.object({}),
        execute: async () => ({ price_list_url: 'url-categorias', categorias: ['Depilación', 'Masajes', 'Facial'] })
    }),
    consultar_servicios: tool({
        description: 'Muestra servicios de una categoría',
        parameters: z.object({ categoriaNombre: z.string() }),
        execute: async ({ categoriaNombre }) => ({
            price_list_url: `url-servicios-${categoriaNombre}`,
            servicios: [
                { id: `s1-${categoriaNombre}`, label: `Servicio A de ${categoriaNombre}`, price: 5000 },
                { id: `s2-${categoriaNombre}`, label: `Servicio B de ${categoriaNombre}`, price: 8000 }
            ]
        })
    }),
    consultar_disponibilidad: tool({
        description: 'Busca turnos',
        parameters: z.object({ serviceIds: z.array(z.string()), fecha: z.string() }),
        execute: async () => ({
            disponible: true,
            horarios: [{ hora: '10:00', staff_name: 'Ana Pérez', staff_role: 'Especialista' }]
        })
    }),
    agendar_turno: tool({
        description: 'Agenda el turno',
        parameters: z.object({ serviceIds: z.array(z.string()), dateTimeIso: z.string() }),
        execute: async () => ({ success: true, mensaje: 'Turno Agendado' })
    })
};

class ConversationSimulator {
    messages: any[] = [];
    historyLog: string[] = [];

    async say(userInput: string) {
        this.messages.push({ role: 'user', content: userInput });
        this.historyLog.push(`\x1b[32mUser:\x1b[0m ${userInput}`);

        const result = await generateText({
            model: getKalonModel(),
            system: getSystemPrompt('mock-123', this.messages.length),
            messages: this.messages,
            tools: mockTools,
            maxSteps: 5
        });

        this.messages.push({ role: 'assistant', content: result.text });
        this.historyLog.push(`\x1b[34mBot:\x1b[0m ${result.text}`);
        
        if (result.toolCalls.length > 0) {
            result.toolCalls.forEach(tc => {
                this.historyLog.push(`   \x1b[33m[TOOL]\x1b[0m ${tc.toolName}`);
            });
        }
    }

    print() {
        console.log(this.historyLog.join('\n'));
    }
}

async function runComplexAudit() {
    console.log("🚀 INICIANDO AUDITORÍA SÚPER AVANZADA (FLUJO HUMANO)");

    const sim = new ConversationSimulator();

    // 1. Registro y multitarea
    await sim.say("Hola, soy Jimena Martus y quiero depilación y masajes.");
    
    // 2. Elección de primer servicio
    await sim.say("Sumame el Cavado (opción 1) de depilación. Y fijate qué masajes hay.");

    // 3. Cambio de opinión
    await sim.say("¿Sabés qué? Sacá el Cavado, poneme solo Masaje Descontracturante. ¿Para mañana hay lugar?");

    // 4. Agendamiento y Pago
    await sim.say("Dale, hoy a las 10:00 (o el que tengas) está perfecto. Confirmame todo.");

    sim.print();

    // VALIDACIONES FINALES
    const finalChat = sim.historyLog.join(' ');
    const checks = {
        askedForDeposit: /seña|50%|depósito/i.test(finalChat),
        gaveProfessional: /Ana Pérez|Ana/i.test(finalChat),
        noAskedPreference: !finalChat.includes("quién preferís") && !finalChat.includes("cuál elegís"),
        logicMaintained: !finalChat.includes("Cavado") || finalChat.lastIndexOf("Masaje") > finalChat.lastIndexOf("Cavado")
    };

    console.log("\n📊 RESULTADOS DE CALIDAD FINAL:");
    Object.entries(checks).forEach(([k, v]) => console.log(` ${v ? '✅' : '❌'} ${k}`));
}

runComplexAudit();

async function runScenario(name: string, messages: { role: 'user' | 'assistant', content: string }[]) {
    console.log(`\n\x1b[36m=== ESCENARIO: ${name} ===\x1b[0m`);
    
    const leadId = null;
    const model = getKalonModel();
    const system = getSystemPrompt(leadId, messages.length);

    try {
        const result = await generateText({
            model,
            system,
            messages,
            tools: mockTools,
            maxSteps: 5,
        });

        console.log(`\x1b[32mBot:\x1b[0m ${result.text}`);
        
        if (result.toolCalls && result.toolCalls.length > 0) {
            console.log(`\x1b[33mHerramientas llamadas:\x1b[0m`);
            result.toolCalls.forEach(tc => {
                console.log(`  - ${tc.toolName} (${JSON.stringify(tc.args)})`);
            });
        }

        // Validaciones automáticas básicas
        const validations = {
            hasEmoji: /[\u{1F300}-\u{1F9FF}]/u.test(result.text),
            isCordobes: /podés|fijate|querés|tenés/i.test(result.text),
            noListInText: !result.text.includes(' - ') && !result.text.includes(' 1. '),
            callTool: result.toolCalls.length > 0
        };

        console.log(`\x1b[34mValidaciones:\x1b[0m`);
        Object.entries(validations).forEach(([key, val]) => {
            console.log(`  ${val ? '✅' : '❌'} ${key}`);
        });

    } catch (error) {
        console.error(`\x1b[31mError en escenario ${name}:\x1b[0m`, error);
    }
}

async function startAudit() {
    console.log("🚀 Iniciando Auditoría del Chatbot KÂLON...");

    // ESCENARIO 1: Registro Proactivo
    await runScenario("Registro e Identificación", [
        { role: 'user', content: 'Hola soy Carlos Saúl' }
    ]);

    // ESCENARIO 2: Salto Inteligente (Ya menciona categorías)
    await runScenario("Salto Inteligente (Pide depilación y masajes directo)", [
        { role: 'user', content: 'Hola soy Mirta Legrand. Quiero depilación y masajes.' }
    ]);

    // ESCENARIO 3: Selección de Sub-servicio (Carrito Paso a Paso)
    await runScenario("Carrito Paso a Paso (Elige de la lista)", [
        { role: 'user', content: 'Soy Susana Gimenez' },
        { role: 'assistant', content: '¡Qué alegría tenerte acá! 💖 Fijate todas nuestras especialidades...' },
        { role: 'user', content: 'Quiero ver Depilación' },
        { role: 'assistant', content: '¡Excelente elección! ✨ Acá tenés las opciones de Depilación...' },
        { role: 'user', content: 'Quiero la opción 1 (Cavado)' }
    ]);

    console.log("\n✨ Auditoría Finalizada.");
}

startAudit();
