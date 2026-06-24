import { promises as fs } from 'fs';
import * as path from 'path';

async function search(dir: string, term: string) {
    const files = await fs.readdir(dir, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            if (file.name !== 'node_modules' && file.name !== '.next') {
                await search(fullPath, term);
            }
        } else if (file.name.endsWith('.tsx') || file.name.endsWith('.ts')) {
            const content = await fs.readFile(fullPath, 'utf-8');
            if (content.includes(term)) {
                console.log(`Found in: ${fullPath}`);
            }
        }
    }
}

async function run() {
    console.log("Searching for /api/chat...");
    await search('./src', '/api/chat');
    process.exit(0);
}

run().catch(console.error);
