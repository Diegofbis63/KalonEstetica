// Test de firma estándar para Vercel Node.js Serverless
export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send("¡Hola desde Node.js Serverless!");
}
