const fs = require('fs');
const content = fs.readFileSync('e:/Antigravity Projects/KalonEstetica/src/pages/Dashboard.tsx', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('Potenciales') || line.includes('leads.map') || line.includes('clientes.map') || line.includes('ClientCard') || line.includes('LeadCard')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
