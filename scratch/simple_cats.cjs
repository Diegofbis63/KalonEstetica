const fs = require('fs');
const cats = JSON.parse(fs.readFileSync('scratch/cats_details.json', 'utf-8'));
const clean = cats.map(c => ({
    name: c.name,
    slug: c.slug,
    price_list_url_length: c.price_list_url ? c.price_list_url.length : 0
}));
console.log(clean);
