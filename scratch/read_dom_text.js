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
    for (const f of files) {
        const fullPath = path.join(dir, f);
        const content = fs.readFileSync(fullPath, 'utf-8');
        console.log(`\n--- File: ${f} ---`);
        console.log(content.substring(0, 1000));
    }
}

parse();
