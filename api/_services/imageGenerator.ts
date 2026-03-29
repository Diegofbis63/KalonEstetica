import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';

/**
 * Los archivos en 'api/' se incluyen en el bundle de Vercel de forma más fiable.
 */
async function loadFont(fileName: string): Promise<Buffer> {
    const paths = [
        path.join(process.cwd(), 'api', 'fonts', fileName),
        path.join(process.cwd(), 'api', '_services', 'fonts', fileName),
        path.join(process.cwd(), 'public', 'fonts', fileName),
        `/var/task/api/fonts/${fileName}`,
        `/var/task/public/fonts/${fileName}`
    ];

    for (const p of paths) {
        try {
            if (fs.existsSync(p)) {
                console.info(`[imageGenerator] Found Font: ${p}`);
                return fs.readFileSync(p);
            }
        } catch (e) {}
    }
    throw new Error(`Font file not found: ${fileName}`);
}

export async function generateMenuImage(title: string, items: { label: string, price?: string | number }[], startIndex: number = 0) {
    try {
        if (!items || items.length === 0) {
            console.warn(`[imageGenerator] Skipping: Empty items list for title "${title}"`);
            return null;
        }

        // Carga de fuentes en paralelo
        const [fontSemi, fontBold] = await Promise.all([
            loadFont('Inter-SemiBold.ttf'),
            loadFont('Inter-Bold.ttf')
        ]);

        const finalHeight = Math.max(380 + (items.length * 52), 550);

        const satoriConfig: any = {
            type: 'div',
            props: {
                style: {
                    height: `${finalHeight}px`,
                    width: '700px',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: '#fdfcfb',
                    color: '#3d2b24',
                    padding: '40px 50px',
                    fontFamily: 'Inter',
                    position: 'relative',
                },
                children: [
                    {
                        type: 'div',
                        props: {
                            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '30px' },
                            children: [
                                {
                                    type: 'div',
                                    props: {
                                        style: { fontSize: '42px', color: '#c5a363', fontWeight: 700, letterSpacing: '6px' },
                                        children: 'KÂLON'
                                    }
                                },
                                {
                                    type: 'div',
                                    props: {
                                        style: { fontSize: '10px', color: '#8d7a6f', letterSpacing: '2px', marginTop: '4px' },
                                        children: 'ESTÉTICA & BIENESTAR'
                                    }
                                }
                            ]
                        }
                    },
                    {
                        type: 'div',
                        props: {
                            style: { 
                                display: 'flex', 
                                fontSize: '24px', 
                                fontWeight: 700, 
                                color: '#3d2b24', 
                                marginBottom: '25px', 
                                borderBottom: '2px solid #c5a363',
                                paddingBottom: '10px'
                            },
                            children: title.toUpperCase()
                        }
                    },
                    {
                        type: 'div',
                        props: {
                            style: { display: 'flex', flexDirection: 'column', width: '100%' },
                            children: items.map((item, idx) => ({
                                type: 'div',
                                key: idx,
                                props: {
                                    style: { 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center',
                                        padding: '12px 0', 
                                        borderBottom: '1px solid rgba(197, 163, 99, 0.15)',
                                        width: '100%'
                                    },
                                    children: [
                                        { 
                                            type: 'div', 
                                            props: { 
                                                style: { display: 'flex', fontWeight: 600, fontSize: '16px', color: '#3d2b24' }, 
                                                children: `${startIndex + idx + 1}. ${item.label}` 
                                            } 
                                        },
                                        item.price ? { 
                                            type: 'div', 
                                            props: { 
                                                style: { display: 'flex', color: '#c5a363', fontWeight: 700, fontSize: '16px' }, 
                                                children: `$${item.price}` 
                                            } 
                                        } : { type: 'div', props: { style: { display: 'flex' }, children: '' } }
                                    ]
                                }
                            }))
                        }
                    }
                ]
            }
        };

        const svg = await satori(satoriConfig, {
            width: 700,
            height: finalHeight,
            fonts: [
                { name: 'Inter', data: fontSemi, weight: 400, style: 'normal' },
                { name: 'Inter', data: fontSemi, weight: 600, style: 'normal' },
                { name: 'Inter', data: fontBold, weight: 700, style: 'normal' },
                { name: 'Inter', data: fontBold, weight: 800, style: 'normal' }
            ],
        });

        return new Resvg(svg).render().asPng();
    } catch (e) {
        console.error("[Satori Fail]:", e);
        return null;
    }
}
