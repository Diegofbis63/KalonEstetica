
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import handler from '../api/chat.js';

async function repro() {
    const mockReq = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messages: [{ role: 'user', content: 'Hola soy Fede' }],
            leadId: null,
            initId: 'test-repro'
        })
    });

    console.log('Testing api/chat handler...');
    try {
        const response = await handler(mockReq);
        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Response Body:', text.substring(0, 500));
    } catch (err) {
        console.error('CRITICAL REPRO ERROR:', err);
    }
}

repro();
