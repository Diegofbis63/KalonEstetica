const fs = require('fs');
const content = fs.readFileSync('e:/Antigravity Projects/KalonEstetica/api/admin.ts', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('role') || line.includes('permission') || line.includes('category_ids') || line.includes('canManage')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
