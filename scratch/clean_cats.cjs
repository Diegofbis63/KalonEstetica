const fs = require('fs');
const cats = JSON.parse(fs.readFileSync('scratch/cats_details.json', 'utf-8'));
const clean = cats.map(c => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    image_url: c.image_url,
    price_list_url_length: c.price_list_url ? c.price_list_url.length : 0,
    price_list_url_prefix: c.price_list_url ? c.price_list_url.substring(0, 50) : null
}));
console.log(JSON.stringify(clean, null, 2));
