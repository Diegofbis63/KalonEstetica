export const runtime = 'edge';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req: Request) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    try {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "¡Hola! Estoy funcionando en modo ultra-ligero. " } }], stage: 'chatting' })}\n\n`));
                await new Promise(r => setTimeout(r, 100)); // Simula latencia mínima
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Si lees esto, el problema está en mis dependencias (IA o DB)." } }], stage: 'chatting' })}\n\n`));
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
            }
        });

        return new Response(stream, {
            headers: {
                ...CORS_HEADERS,
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Connection': 'keep-alive'
            }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { 
            status: 500, 
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        });
    }
}
