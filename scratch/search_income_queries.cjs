const fs = require('fs');
const content = fs.readFileSync('e:/Antigravity Projects/KalonEstetica/api/admin.ts', 'utf-8');
const lines = content.split('\n');
let insideIncome = false;
lines.forEach((line, index) => {
  if (line.includes("sec === 'income'")) {
    insideIncome = true;
  }
  if (insideIncome && line.includes("sec === '")) {
    // Left section
    if (!line.includes("sec === 'income'")) {
      insideIncome = false;
    }
  }
  if (insideIncome) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
