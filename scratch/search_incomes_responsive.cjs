const fs = require('fs');
const content = fs.readFileSync('e:/Antigravity Projects/KalonEstetica/src/pages/Incomes.tsx', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('grid-cols') || line.includes('overflow') || line.includes('hidden') || line.includes('sm:') || line.includes('md:')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
