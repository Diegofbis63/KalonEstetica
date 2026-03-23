export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // El frontend espera un objeto con la propiedad "categories"
    // Según el ZodError: Expected object, received array.
    return res.status(200).json({
        categories: [
            { id: 'facial', name: 'Facial' },
            { id: 'corporal', name: 'Corporal' }
        ]
    });
}
