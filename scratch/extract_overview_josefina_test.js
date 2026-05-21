import fs from 'fs';
import path from 'path';

const file = 'C:\\Users\\fede_\\.gemini\\antigravity\\brain\\feb97e86-4d01-447d-b103-16fed98daca7\\.system_generated\\logs\\overview.txt';

function search() {
    if (!fs.existsSync(file)) {
        console.log("overview.txt not found");
        return;
    }
    
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    console.log(`overview.txt has ${lines.length} lines.`);
    
    // Find matching lines
    let matches = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes('josefina') || line.toLowerCase().includes('breu')) {
            // Ignore script contents that contain these keywords to avoid noise
            if (!line.includes('write_to_file') && !line.includes('ReplacementChunks') && !line.includes('find_josefina')) {
                matches.push({ index: i, content: line });
            }
        }
    }
    
    console.log(`Found ${matches.length} matches (excluding scripts).`);
    
    // Group matches that are close together and print their blocks
    let lastPrintedIndex = -1;
    for (const match of matches) {
        if (match.index <= lastPrintedIndex) continue;
        
        console.log(`\n--- Match around line ${match.index} ---`);
        const start = Math.max(0, match.index - 5);
        const end = Math.min(lines.length - 1, match.index + 10);
        
        for (let j = start; j <= end; j++) {
            console.log(`${j}: ${lines[j].substring(0, 150)}`);
        }
        lastPrintedIndex = end;
    }
}

search();
