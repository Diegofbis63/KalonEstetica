import fs from 'fs';
import path from 'path';

const dir = 'C:\\Users\\fede_\\.gemini\\antigravity\\brain\\feb97e86-4d01-447d-b103-16fed98daca7\\.tempmediaStorage';

function extractChat() {
    const files = fs.readdirSync(dir)
        .filter(f => f.startsWith('dom_') && f.endsWith('.txt'))
        .sort((a, b) => {
            const numA = parseInt(a.replace('dom_', '').replace('.txt', ''));
            const numB = parseInt(b.replace('dom_', '').replace('.txt', ''));
            return numA - numB;
        });

    console.log(`Analyzing chat text from ${files.length} DOM files...`);
    let uniqueTexts = new Set();
    
    for (const f of files) {
        const fullPath = path.join(dir, f);
        const content = fs.readFileSync(fullPath, 'utf-8');
        
        // Find all occurrences of text inside tags, e.g. <span ...>Text</span> or <p ...>Text</p>
        // In the dome snapshot, it is represented like:
        // [tag_id] (x,y)<tag_name ...>Text
        // Let's use a regex to match text content:
        // Example: <span ...>Text
        // or just look for the text of chat messages.
        // Let's print lines that contain "josefina", "breu", "depilacion", "pestañas", "precio", "turno"
        const lines = content.split('\n');
        let fileHasChat = false;
        let messagesInFile = [];
        
        for (const line of lines) {
            // Let's capture the text after the tag if it's there
            const match = line.match(/<[a-z0-9]+[^>]*>\s*([^<]*)/i);
            if (match && match[1] && match[1].trim().length > 0) {
                const textVal = match[1].trim();
                // Filter out standard header/button texts to only get the conversational content
                if (
                    textVal !== 'KÂLON' && 
                    textVal !== 'Multiespacio Estético' && 
                    textVal !== 'Servicios' && 
                    textVal !== 'K' && 
                    textVal !== 'Reservar Cita' && 
                    textVal !== 'Iniciar Chat' && 
                    textVal !== 'Kâlon' &&
                    textVal !== 'Online' &&
                    !textVal.includes('DOM') &&
                    !textVal.includes('snapshot')
                ) {
                    messagesInFile.push(textVal);
                }
            }
        }
        
        if (messagesInFile.length > 0) {
            const fileKey = messagesInFile.join(' | ');
            if (!uniqueTexts.has(fileKey)) {
                uniqueTexts.add(fileKey);
                console.log(`\n--- Snapshot ${f} ---`);
                messagesInFile.forEach(m => console.log(`  - ${m}`));
            }
        }
    }
}

extractChat();
