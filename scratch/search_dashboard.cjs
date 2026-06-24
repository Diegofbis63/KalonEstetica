const fs = require('fs');
const content = fs.readFileSync('e:/Antigravity Projects/KalonEstetica/src/pages/Dashboard.tsx', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('appointments') || line.includes('status') || line.includes('pending')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
