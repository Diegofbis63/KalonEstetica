const fs = require('fs');
const content = fs.readFileSync('e:/Antigravity Projects/KalonEstetica/src/pages/Settings.tsx', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('UsersResponseSchema') || line.includes('z.object') || line.includes('UserAccount')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
