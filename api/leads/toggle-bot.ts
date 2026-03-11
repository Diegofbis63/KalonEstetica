import { neon } from '@neondatabase/serverless';

export default async function handler(req: Request) {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
    };

    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });

    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) return new Response(JSON.stringify({ error: "Missing database connection string" }), { status: 500, headers: corsHeaders });

    try {
        const { leadId, isBotEnabled } = await req.json();
        if (!leadId) return new Response(JSON.stringify({ error: "Missing leadId" }), { status: 400, headers: corsHeaders });

        const sql = neon(connectionString);
        await sql`UPDATE leads SET is_bot_enabled = ${isBotEnabled} WHERE id = ${leadId}`;

        return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    } catch (error) {
        console.error("Toggle bot error:", error);
        return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: corsHeaders });
    }
}
