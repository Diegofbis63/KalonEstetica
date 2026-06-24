const fs = require('fs');
const content = fs.readFileSync('e:/Antigravity Projects/KalonEstetica/src/pages/Dashboard.tsx', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('intent_score') || line.toLowerCase().includes('interé') || line.toLowerCase().includes('intere') || line.toLowerCase().includes('intent')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
