import fs from 'fs';
import path from 'path';

const dir = 'C:\\Users\\fede_\\.gemini\\antigravity\\brain\\feb97e86-4d01-447d-b103-16fed98daca7\\.tempmediaStorage';

function parse() {
    const files = fs.readdirSync(dir)
        .filter(f => f.startsWith('dom_') && f.endsWith('.txt'))
        .sort((a, b) => {
            const numA = parseInt(a.replace('dom_', '').replace('.txt', ''));
            const numB = parseInt(b.replace('dom_', '').replace('.txt', ''));
            return numA - numB;
        });

    console.log(`Found ${files.length} DOM files.`);
    let lastChatLines = [];
    
    for (const f of files) {
        const fullPath = path.join(dir, f);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        
        // Find the index of the scrollable chat container
        // It looks like: [id] (x,y)<div class='flex-1 overflow-y-auto p-6 space-y-4' scrollable='true' />
        const containerIndex = lines.findIndex(l => l.includes("overflow-y-auto") && l.includes("space-y-4"));
        if (containerIndex !== -1) {
            // Find subsequent lines until the next bracket tag [id] or end of div
            let chatLines = [];
            for (let i = containerIndex + 1; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim().startsWith('[') || line.includes('</current_dom>')) {
                    break;
                }
                if (line.trim().length > 0) {
                    chatLines.push(line.trim());
                }
            }
            
            // Check if these chat lines are different from the last ones
            if (chatLines.length > 0 && chatLines.join(' | ') !== lastChatLines.join(' | ')) {
                console.log(`\n===================================`);
                console.log(`SNAPSHOT: ${f}`);
                console.log(`===================================`);
                chatLines.forEach(l => console.log(l));
                lastChatLines = chatLines;
            }
        }
    }
}

parse();
