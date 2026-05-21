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
    
    // Find all occurrences of "josefina" or "breu" case-insensitively
    let matches = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes('josefina') || line.toLowerCase().includes('breu')) {
            matches.push({ lineIndex: i, content: line });
        }
    }
    
    console.log(`Found ${matches.length} matches.`);
    
    // For each match, print a window of 20 lines before and after to get full context
    // But to prevent flooding, let's group them or just print the most relevant ones.
    // Let's print some windows
    for (const match of matches.slice(0, 10)) {
        console.log(`\n--- Match at line ${match.lineIndex} ---`);
        const start = Math.max(0, match.lineIndex - 10);
        const end = Math.min(lines.length - 15, match.lineIndex + 15);
        for (let j = start; j <= end; j++) {
            console.log(`${j}: ${lines[j]}`);
        }
    }
}

search();
