const fs = require('fs');
const content = fs.readFileSync('e:/Antigravity Projects/KalonEstetica/src/pages/Dashboard.tsx', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('dashLoading') || line.includes('loading') || line.includes('Skeleton')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
