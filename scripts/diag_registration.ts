
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { buildTools } from './api/_services/ai_tools.js';

async function testTarget() {
    console.log('Testing registrar_cliente for: Julieta Arevalo');
    const tools = buildTools(null, 'kalon-estetica', 'test-id');
    const regTool = tools.registrar_cliente;
    
    try {
        const result = await regTool.execute({ nombre: 'Julieta Arevalo' });
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('FAILED:', err);
    }
}

testTarget();
