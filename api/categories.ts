export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Retornamos un array vacío o mock para evitar el 404 que rompe el frontend
    return res.status(200).json([
        { id: 'facial', name: 'Facial' },
        { id: 'corporal', name: 'Corporal' }
    ]);
}
