const fs = require('fs');

function searchQueries(filename) {
  const content = fs.readFileSync(filename, 'utf-8');
  const lines = content.split('\n');
  console.log(`=== QUERIES IN ${filename} ===`);
  lines.forEach((line, index) => {
    if (line.includes('useQuery') || line.includes('isLoading') || line.includes('isPending')) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  });
}

searchQueries('e:/Antigravity Projects/KalonEstetica/src/pages/Dashboard.tsx');
searchQueries('e:/Antigravity Projects/KalonEstetica/src/pages/Clients.tsx');
