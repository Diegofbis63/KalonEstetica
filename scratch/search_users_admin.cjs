const fs = require('fs');
const content = fs.readFileSync('e:/Antigravity Projects/KalonEstetica/api/admin.ts', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('users') || line.includes('password') || line.includes('raw_password')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
