import { config } from 'dotenv';
config();

import { extractState, ConvState, Service, Category, ChatMessage } from '../api/_services/stateMachine';
import { getCategories, getActiveServices } from '../api/_services/db';

async function runFlow() {
    const categories: Category[] = await getCategories();
    const services: Service[] = await getActiveServices();

    const messages: ChatMessage[] = [];
    const clientName = "Josefina";
    const clientPhone = "3510000000";
    let state: ConvState | null = null;
    let savedState: ConvState | null = null;

    const turns = [
        "hola",
        "depilacion",
        "soprano flex box",
        "agregar",
        "cejas",
        "laminado",
        "quitar",
        "soprano flex box",
        "listo",
        "Josefina",
        "3510000000",
        "mañana a las 15",
        "dale confirma el turno",
        "ahi te pase el comprobante", // wait for media intercept
        "otro turno"                  // test re-booking
    ];

    for (let i = 0; i < turns.length; i++) {
        const input = turns[i];
        
        let mediaUrl;
        if (input.includes("ahi te pase")) {
            mediaUrl = "https://example.com/receipt.jpg";
        }
        
        messages.push({ role: 'user', content: input, media_url: mediaUrl });
        console.log(`\n--- TURN ${i} --- User: "${input}"`);

        state = await extractState(messages, categories, services, true, clientName, clientPhone, savedState, new Date());
        
        if ((state.stage === 'waiting_for_receipt' || state.stage === 'payment_request' || state.stage === 'done') && mediaUrl) {
           console.log("[MOCK] Media received, finalizing appointment...");
           state.stage = 'done';
        }

        console.log(`[stateMachine] Stage=${state.stage}`);
        console.log(`   Cart: ${state.selectedServiceIds.length} items. Error: ${state.errorType}`);
        
        savedState = state;
        
        let botMsg = `[Mock bot reply for stage ${state.stage}]`;
        if (state.stage === 'greeting') botMsg = "¿qué servicios te interesan hoy?";
        if (state.stage === 'parent_selection') botMsg = "Decime de qué categoría te gustaría ver los servicios hoy para seguir";
        if (state.stage === 'sub_service_selection') botMsg = "¿Cuál te gustaría realizarte?";
        if (state.stage === 'cart_review') botMsg = "¿Es correcto o te gustaría agregar o modificar algo?";
        if (state.stage === 'name_collection') botMsg = "¿cómo es tu nombre completo?";
        if (state.stage === 'payment_request') botMsg = "necesitamos una seña";
        
        messages.push({ role: 'bot', content: botMsg });
    }
}

runFlow()
    .then(() => process.exit(0))
    .catch(console.error);
