// Test directo contra el endpoint de producción
import https from 'https';

const body = JSON.stringify({
  messages: [
    { role: 'user', content: 'nancy ortega' }
  ],
  initId: 'test-diag-' + Date.now()
});

console.log('Sending request to kalon-estetica.vercel.app/api/chat...');
console.log('Body:', body);

const req = https.request(
  'https://kalon-estetica.vercel.app/api/chat',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  },
  (res) => {
    console.log('\nStatus:', res.statusCode);
    console.log('Headers:', JSON.stringify(res.headers, null, 2));
    
    let fullData = '';
    res.on('data', (chunk) => {
      const text = chunk.toString();
      fullData += text;
      // Parse SSE events
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            console.log('\n--- STREAM DONE ---');
          } else {
            try {
              const parsed = JSON.parse(data);
              if (parsed.leadId) {
                console.log('\n[LEAD ID]:', parsed.leadId);
              }
              if (parsed.media_url) {
                console.log('\n[MEDIA URL]:', parsed.media_url);
              }
              if (parsed.choices?.[0]?.delta?.content) {
                process.stdout.write(parsed.choices[0].delta.content);
              }
            } catch (e) {
              console.log('\n[PARSE ERROR]:', data);
            }
          }
        }
      }
    });
    
    res.on('end', () => {
      console.log('\n\n=== RAW RESPONSE ===');
      console.log(fullData);
    });
  }
);

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.write(body);
req.end();
