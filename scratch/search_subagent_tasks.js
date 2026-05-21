import fs from 'fs';

const file = 'C:\\Users\\fede_\\.gemini\\antigravity\\brain\\feb97e86-4d01-447d-b103-16fed98daca7\\.system_generated\\logs\\overview.txt';

function search() {
    if (!fs.existsSync(file)) {
        console.log("overview.txt not found");
        return;
    }
    
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    console.log(`Searching for browser_subagent tool calls...`);
    
    let matchCount = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('browser_subagent')) {
            matchCount++;
            console.log(`\n--- Call #${matchCount} at line ${i} ---`);
            try {
                const parsed = JSON.parse(line);
                const calls = parsed.tool_calls || [];
                for (const call of calls) {
                    if (call.name === 'browser_subagent') {
                        console.log(`TaskName: ${call.args?.TaskName}`);
                        console.log(`TaskSummary: ${call.args?.TaskSummary}`);
                        console.log(`Task: ${call.args?.Task}`);
                    }
                }
            } catch (e) {
                console.log(line.substring(0, 500));
            }
        }
    }
}

search();
