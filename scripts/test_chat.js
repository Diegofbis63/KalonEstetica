import https from 'https';
import { readFileSync } from 'fs';

// Load env
const envFile = readFileSync('.env.local', 'utf8');
const apiKey = envFile.match(/OPENROUTER_API_KEY="?([^"\n]+)"?/)?.[1];

if (!apiKey) {
  console.error('No API key found in .env.local');
  process.exit(1);
}

console.log('API Key found:', apiKey.slice(0, 20) + '...');
console.log('Testing model: google/gemini-2.0-flash-001');

const tools = [
  {
    type: 'function',
    function: {
      name: 'registrar_cliente',
      description: 'Registra un nuevo cliente en KÂLON.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre del cliente' },
          apellido: { type: 'string', description: 'Apellido del cliente' }
        },
        required: ['nombre', 'apellido']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listar_categorias_principales',
      description: 'Lista categorías principales de servicios.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_servicios',
      description: 'Obtiene catálogo visual de servicios por categoría.',
      parameters: {
        type: 'object',
        properties: {
          categorias: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de categorías'
          }
        },
        required: ['categorias']
      }
    }
  }
];

const body = JSON.stringify({
  model: 'google/gemini-2.0-flash-001',
  messages: [
    {
      role: 'system',
      content: 'Sos el asistente de KÂLON Estética. Tu objetivo es agendar turnos. El cliente es ANÓNIMO, pedí nombre y apellido primero.'
    },
    { role: 'user', content: 'Hola, soy Lucia Garcia' }
  ],
  tools,
  max_tokens: 1024,
  stream: false
});

const req = https.request(
  'https://openrouter.ai/api/v1/chat/completions',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://kalon-estetica.vercel.app',
      'X-Title': 'Kalon Estética Chatbot',
      'Content-Length': Buffer.byteLength(body)
    }
  },
  (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      console.log('\nStatus:', res.statusCode);
      try {
        const parsed = JSON.parse(data);
        console.log('\nResponse:', JSON.stringify(parsed, null, 2));
      } catch {
        console.log('\nRaw response:', data);
      }
    });
  }
);
req.on('error', e => console.error('Request error:', e));
req.write(body);
req.end();
