const fs = require('fs');
const content = fs.readFileSync('e:/Antigravity Projects/KalonEstetica/api/_services/schema.ts', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('category_ids') || line.includes('admin_users')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
