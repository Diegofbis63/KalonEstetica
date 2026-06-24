const fs = require('fs');
const content = fs.readFileSync('e:/Antigravity Projects/KalonEstetica/src/pages/Clients.tsx', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.toLowerCase().includes('intere') || line.includes('intent') || line.includes('score')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
