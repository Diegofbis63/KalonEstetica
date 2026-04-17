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

        const isMultiColumn = items.length > 15;
        const columnCount = isMultiColumn ? 2 : 1;
        const itemsPerColumn = Math.ceil(items.length / columnCount);
        
        const finalWidth = isMultiColumn ? 1200 : 750;
        const finalHeight = Math.max(380 + (itemsPerColumn * 52), 600);

        const satoriConfig: any = {
            type: 'div',
            props: {
                style: {
                    height: `${finalHeight}px`,
                    width: `${finalWidth}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: '#fff', // Pure white for better contrast
                    color: '#3d2b24',
                    padding: '60px 70px',
                    fontFamily: 'Inter',
                    position: 'relative',
                },
                children: [
                    {
                        type: 'div',
                        props: {
                            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '40px' },
                            children: [
                                {
                                    type: 'div',
                                    props: {
                                        style: { fontSize: '48px', color: '#c5a363', fontWeight: 800, letterSpacing: '8px' },
                                        children: 'KÂLON'
                                    }
                                },
                                {
                                    type: 'div',
                                    props: {
                                        style: { fontSize: '12px', color: '#8d7a6f', letterSpacing: '4px', marginTop: '6px', opacity: 0.8 },
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
                                fontSize: '28px', 
                                fontWeight: 800, 
                                color: '#3d2b24', 
                                marginBottom: '35px', 
                                borderBottom: '3px solid #c5a363',
                                paddingBottom: '12px',
                                width: '100%'
                            },
                            children: title.toUpperCase()
                        }
                    },
                    {
                        type: 'div',
                        props: {
                            style: { 
                                display: 'flex', 
                                flexDirection: 'row', 
                                width: '100%', 
                                gap: isMultiColumn ? '80px' : '0px' 
                            },
                            children: Array.from({ length: columnCount }).map((_, colIdx) => ({
                                type: 'div',
                                key: colIdx,
                                props: {
                                    style: { 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        flex: 1 
                                    },
                                    children: items.slice(colIdx * itemsPerColumn, (colIdx + 1) * itemsPerColumn).map((item, idx) => ({
                                        type: 'div',
                                        key: idx,
                                        props: {
                                            style: { 
                                                display: 'flex', 
                                                justifyContent: 'space-between', 
                                                alignItems: 'center',
                                                padding: '14px 0', 
                                                borderBottom: '1px solid rgba(197, 163, 99, 0.1)',
                                                width: '100%'
                                            },
                                            children: [
                                                { 
                                                    type: 'div', 
                                                    props: { 
                                                        style: { display: 'flex', fontWeight: 600, fontSize: '18px', color: '#3d2b24', flex: 1 }, 
                                                        children: `${startIndex + (colIdx * itemsPerColumn) + idx + 1}. ${item.label}` 
                                                    } 
                                                },
                                                item.price ? { 
                                                    type: 'div', 
                                                    props: { 
                                                        style: { display: 'flex', color: '#c5a363', fontWeight: 700, fontSize: '18px', marginLeft: '20px' }, 
                                                        children: `$${item.price}` 
                                                    } 
                                                } : { type: 'div', props: { style: { display: 'flex' }, children: '' } }
                                            ]
                                        }
                                    }))
                                }
                            }))
                        }
                    }
                ]
            }
        };

        const svg = await satori(satoriConfig, {
            width: finalWidth,
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
