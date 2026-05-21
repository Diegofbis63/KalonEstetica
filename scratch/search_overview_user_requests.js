import fs from 'fs';
import path from 'path';

const file = 'C:\\Users\\fede_\\.gemini\\antigravity\\brain\\feb97e86-4d01-447d-b103-16fed98daca7\\.system_generated\\logs\\overview.txt';

function search() {
    if (!fs.existsSync(file)) {
        console.log("overview.txt not found");
        return;
    }
    
    const content = fs.readFileSync(file, 'utf-8');
    
    // Find all <USER_REQUEST> ... </USER_REQUEST> blocks
    const regex = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/gi;
    let match;
    let count = 0;
    
    while ((match = regex.exec(content)) !== null) {
        count++;
        console.log(`\n--- USER REQUEST #${count} ---`);
        console.log(match[1].trim());
    }
    
    console.log(`\nFound ${count} user requests.`);
}

search();
