import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';
import OpenAI from 'openai';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY,
  baseURL: process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : undefined
});

async function run() {
  const categories = await sql`SELECT id, name FROM categories`;
  const services = await sql`
    SELECT s.title, c.id as category_id, c.name as category_name 
    FROM services s 
    LEFT JOIN categories c ON s.category_id = c.id 
    WHERE s.active = true
  `;

  // Build category list with examples
  const catList = categories.map(c => {
    const sList = services
      .filter(s => s.category_id === c.id)
      .map(s => s.title)
      .join(', ');
    return `${c.id}: ${c.name} (${sList || 'sin servicios'})`;
  }).join('\n');
  
  const text = "gluteos y laminado de cejas";
  const recentHistory = "";

  const classificationPrompt = `Analiza el mensaje del usuario para KÂLON Estética y clasifica su intención.
Categorías disponibles y sus servicios comunes:
${catList}

Estado actual del Lead: No Identificado

Contexto reciente de la conversación:
${recentHistory}
IMPORTANTE: Si el usuario está agendando un turno o preguntando disponibilidad, ASEGÚRATE de inferir y rellenar "detected_categories" basándote en el 'Contexto reciente de la conversación', extrayendo los IDs de los servicios que solicitó previamente.

Responde ÚNICAMENTE un objeto JSON con el siguiente formato exacto:
{
  "intent": "SALUDO" | "REGISTRO" | "CONSULTA_SERVICIO" | "TURNO" | "OTRO",
  "detected_categories": ["id1", "id2"],
  "detected_name": "nombre si es registro",
  "is_negation": true/false
}

Mensaje actual del usuario: "${text}"`;

  console.log("PROMPT:\n", classificationPrompt);

  const res = await openai.chat.completions.create({
    model: 'google/gemini-2.5-flash',
    messages: [{ role: 'system', content: classificationPrompt }],
    response_format: { type: 'json_object' }
  });

  console.log("\nRESPONSE:\n", res.choices[0].message.content);
}

run().catch(console.error);
