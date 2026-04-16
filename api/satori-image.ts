import { generateMenuImage } from './_services/imageGenerator.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
    maxDuration: 60,
};

/**
 * Endpoint dedicado para renderizar imágenes Satori para KÂLON.
 * Este corre en Node.js para permitir el acceso a fuentes locales vía fs.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { title, data } = req.query;

        if (!title || !data) {
            return res.status(400).json({ error: 'Missing title or data' });
        }

        // Decodificar items desde base64 (pasado como string JSON encodeado)
        let items = [];
        try {
            const decoded = Buffer.from(data as string, 'base64').toString();
            items = JSON.parse(decoded);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid data format' });
        }

        console.log(`[api/satori-image] Generating: ${title} (${items.length} items)`);

        // Generar la imagen usando el servicio existente
        const imageBuffer = await generateMenuImage(title as string, items);

        if (!imageBuffer) {
            return res.status(500).json({ error: 'Failed to generate image' });
        }

        // Retornar la imagen PNG con headers de caché
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
        res.status(200).send(imageBuffer);

    } catch (error: any) {
        console.error('[api/satori-image] Fatal error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
