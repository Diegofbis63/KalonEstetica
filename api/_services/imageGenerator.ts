
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';


let fontData: Buffer | null = null;
let logoData: string | null = null;


// Function to get the font as a buffer
async function getFontData() {
    if (fontData) return fontData;
    
    // Attempt local path with multiple Inter variants
    const localFontPaths = [
        path.join(process.cwd(), 'public', 'fonts', 'Inter-SemiBold.ttf'),
        path.join(process.cwd(), 'public', 'fonts', 'Inter-Bold.ttf'),
    ];
    
    for (const p of localFontPaths) {
        try {
            if (fs.existsSync(p)) {
                console.log(`[imageGenerator] Loading local font: ${p}`);
                fontData = fs.readFileSync(p);
                return fontData;
            }
        } catch (e) {
            console.warn(`[imageGenerator] Failed to read ${p}:`, e);
        }
    }

    // Fallback: fetch directly from Google Fonts static CDN (canonical TTF)
    try {
        console.log("[imageGenerator] Fetching fallback font from CDN...");
        const response = await fetch('https://github.com/google/fonts/raw/main/ofl/inter/static/Inter-SemiBold.ttf');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        fontData = Buffer.from(arrayBuffer);
        return fontData;
    } catch (e) {
        console.error("[imageGenerator] Font fetch failed:", e);
    }
    return fontData;
}

// Function to get the logo as a base64 string
function getLogoData() {
    if (logoData) return logoData;
    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoData = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }
    return logoData;
}

export async function generateMenuImage(title: string, items: { label: string, price?: string | number }[]) {
    const font = await getFontData();
    const logoBase64 = getLogoData();
    if (!font) throw new Error("No font for Satori!");

    const satoriConfig: any = {
        type: 'div',
        props: {
            style: {
                height: '100%',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#0a0a0a', // Deeper background for premium feel
                color: '#fff',
                padding: '45px',
                fontFamily: 'Inter',
                border: '3px solid #c5a363', // Premium Gold Border
                backgroundImage: 'radial-gradient(circle at 50% 50%, #1a1a1a 0%, #0a0a0a 100%)',
            },
            children: [
                // Header with Logo
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            marginBottom: '35px',
                        },
                        children: [
                            logoBase64 ? {
                                type: 'img',
                                props: {
                                    src: logoBase64,
                                    style: {
                                        width: '120px',
                                        height: 'auto',
                                        marginBottom: '10px',
                                        opacity: 0.9,
                                    }
                                }
                            } : {
                                type: 'span',
                                props: {
                                    style: {
                                        fontSize: '32px',
                                        fontWeight: 'bold',
                                        color: '#c5a363',
                                        textTransform: 'uppercase',
                                        letterSpacing: '2px',
                                    },
                                    children: 'KÂLON'
                                }
                            }
                        ]
                    }
                },
                // Title Section
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            marginBottom: '35px',
                        },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        fontSize: '26px',
                                        color: '#fff',
                                        fontWeight: 600,
                                        borderBottom: '1px solid rgba(197, 163, 99, 0.4)',
                                        paddingBottom: '12px',
                                        minWidth: '200px',
                                        textAlign: 'center',
                                    },
                                    children: title
                                }
                            }
                        ]
                    }
                },
                // Items List
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '14px',
                        },
                        children: items.map((item, index) => {
                            const isService = item.price !== undefined;
                            return {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        fontSize: '20px',
                                        padding: '12px 18px',
                                        backgroundColor: 'rgba(197, 163, 99, 0.03)',
                                        border: '1px solid rgba(197, 163, 99, 0.08)',
                                        borderRadius: '8px',
                                    },
                                    children: [
                                        {
                                            type: 'div',
                                            props: {
                                                style: { display: 'flex', alignItems: 'center', gap: '12px' },
                                                children: [
                                                    {
                                                        type: 'span',
                                                        props: {
                                                            style: { 
                                                                color: '#c5a363', 
                                                                fontWeight: 'bold',
                                                                width: '24px'
                                                            },
                                                            children: `${index + 1}`
                                                        }
                                                    },
                                                    {
                                                        type: 'span',
                                                        props: { 
                                                            style: { color: 'rgba(255,255,255,0.95)' },
                                                            children: item.label 
                                                        }
                                                    }
                                                ]
                                            }
                                        },
                                        isService ? {
                                            type: 'span',
                                            props: {
                                                style: { 
                                                    color: '#c5a363', 
                                                    fontWeight: 'bold',
                                                    fontSize: '18px'
                                                },
                                                children: item.price ? `$${item.price}` : 'Consultar'
                                            }
                                        } : null
                                    ]
                                }
                            };
                        })
                    }
                },
                // Footer
                {
                    type: 'div',
                    props: {
                        style: {
                            marginTop: 'auto',
                            display: 'flex',
                            justifyContent: 'center',
                            opacity: 0.6,
                        },
                        children: [
                            {
                                type: 'span',
                                props: {
                                    style: { fontSize: '15px' },
                                    children: 'Por favor, respondé con el número de tu opción.'
                                }
                            }
                        ]
                    }
                }
            ],
        },
    };

    const svg = await satori(satoriConfig, {
        width: 500,
        height: 700,
        fonts: [
            {
                name: 'Inter',
                data: font,
                weight: 600,
                style: 'normal',
            },
        ],
    });

    const resvg = new Resvg(svg);
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    
    return pngBuffer;
}
