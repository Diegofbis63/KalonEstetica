import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';

let fontData: Buffer | null = null;
const secondaryFontData: Buffer | null = null;
let logoData: string | null = null;

/**
 * Los archivos en 'api/' se incluyen en el bundle de Vercel de forma más fiable.
 * No usamos fetch externo para evitar HANGS (cuelgues) por timeouts de red.
 */
function getFontData() {
    if (fontData) return fontData;
    const paths = [
        path.join(process.cwd(), 'api', 'fonts', 'Inter-SemiBold.ttf'),
        path.join(process.cwd(), 'api', '_services', 'fonts', 'Inter-SemiBold.ttf'),
        path.join(process.cwd(), 'public', 'fonts', 'Inter-SemiBold.ttf'),
        '/var/task/api/fonts/Inter-SemiBold.ttf',
        '/var/task/public/fonts/Inter-SemiBold.ttf'
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            console.log(`[imageGenerator] Found Font: ${p}`);
            fontData = fs.readFileSync(p);
            return fontData;
        }
    }
    // Fallback: Si no hay fuente, tiramos error rápido para no colgar el stream
    throw new Error("Critical: Font data missing for Satori rendering!");
}

function getSecondaryFontData() {
    if (secondaryFontData) return secondaryFontData;
    // Si no tenemos Cinzel, usamos Inter para no arriesgar fetch externo
    return getFontData();
}

function getLogoData() {
    if (logoData) return logoData;
    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    if (fs.existsSync(logoPath)) {
        logoData = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
    }
    return logoData;
}

export async function generateMenuImage(title: string, items: { label: string, price?: string | number }[]) {
    try {
        const font = getFontData();
        const cinzel = getSecondaryFontData();
        const isotypeBase64 = getLogoData();
        
        const finalHeight = Math.max(450 + (items.length * 55), 650);

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
                    padding: '60px',
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
                                        style: { fontSize: '48px', color: '#c5a363', fontWeight: 700, letterSpacing: '6px' },
                                        children: 'KÂLON'
                                    }
                                },
                                { 
                                    type: 'div', 
                                    props: { 
                                        style: { fontSize: '22px', fontWeight: 700, marginTop: '20px', borderBottom: '2px solid #c5a363', padding: '5px 15px', letterSpacing: '3px' }, 
                                        children: title.toUpperCase() 
                                    }
                                }
                            ]
                        }
                    },
                    {
                        type: 'div',
                        props: {
                            style: { display: 'flex', flexDirection: 'column', flex: 1 },
                            children: items.map((item, idx) => ({
                                type: 'div',
                                props: {
                                    style: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(197, 163, 99, 0.2)' },
                                    children: [
                                        { type: 'span', props: { style: { fontWeight: 600 }, children: `${idx + 1}. ${item.label}` } },
                                        item.price ? { type: 'span', props: { style: { color: '#c5a363', fontWeight: 800 }, children: `$${item.price}` } } : null
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
                { name: 'Inter', data: font, weight: 600, style: 'normal' }
            ],
        });

        return new Resvg(svg).render().asPng();
    } catch (e) {
        console.error("[Satori Fail]:", e);
        return null;
    }
}
