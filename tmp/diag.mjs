
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function diag() {
    const key = process.env.OPENROUTER_API_KEY;
    console.log("Checking API Key presence:", key ? "PRESENT (length: " + key.length + ")" : "MISSING");
    
    if (!key) return;

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'google/gemini-2.0-flash-001',
                messages: [{ role: 'user', content: 'Say hi' }]
            })
        });

        const data = await response.json();
        console.log("OpenRouter Response Status:", response.status);
        console.log("Response Data:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}
diag();
