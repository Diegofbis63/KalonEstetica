
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';


let fontData: Buffer | null = null;
let logoData: string | null = null;
let templateData: string | null = null;


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

// Function to get the background template as a base64 string
function getTemplateData() {
    if (templateData) return templateData;
    const templatePath = path.join(process.cwd(), 'public', 'template_chatbot.png');
    if (fs.existsSync(templatePath)) {
        const templateBuffer = fs.readFileSync(templatePath);
        templateData = `data:image/png;base64,${templateBuffer.toString('base64')}`;
    }
    return templateData;
}

export async function generateMenuImage(title: string, items: { label: string, price?: string | number }[]) {
    const font = await getFontData();
    const logoBase64 = getLogoData();
    const templateBase64 = getTemplateData();
    if (!font) throw new Error("No font for Satori!");

    // Adjust height and item density based on whether we use a template
    const itemHeight = templateBase64 ? 65 : 80; // More compact if using template
    const calculatedHeight = 280 + (items.length * itemHeight); 
    const finalHeight = Math.max(calculatedHeight, 600); 

    const satoriConfig: any = {
        type: 'div',
        props: {
            style: {
                height: `${finalHeight}px`,
                width: '600px',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#0a0a0a',
                color: '#fff',
                padding: templateBase64 ? '200px 55px 50px 55px' : '60px 50px', // Large top padding for template header
                fontFamily: 'Inter',
                backgroundImage: templateBase64 ? `url(${templateBase64})` : 'radial-gradient(circle at 50% 10%, #1a1a1a 0%, #050505 100%)',
                backgroundSize: '100% 100%',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '0px',
            },
            children: [
                // Top accent design (Omitted if template has its own border)
                !templateBase64 ? {
                    type: 'div',
                    props: {
                        style: {
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '6px',
                            background: 'linear-gradient(90deg, transparent, #c5a363, transparent)',
                        }
                    }
                } : null,
                // Header with Logo - ONLY if NO template (Template already has it)
                !templateBase64 && logoBase64 ? {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            marginBottom: '40px',
                        },
                        children: [
                            {
                                type: 'img',
                                props: {
                                    src: logoBase64,
                                    style: {
                                        width: '160px',
                                        height: 'auto',
                                        marginBottom: '10px',
                                        filter: 'drop-shadow(0 4px 10px rgba(197, 163, 99, 0.2))',
                                    }
                                }
                            },
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        fontSize: '12px',
                                        color: '#c5a363',
                                        textTransform: 'uppercase',
                                        letterSpacing: '5px',
                                        fontWeight: 700,
                                        marginTop: '10px',
                                        opacity: 0.8,
                                    },
                                    children: 'ESTÉTICA & BIENESTAR'
                                }
                            }
                        ]
                    }
                } : null,
                // Title Section - ONLY if NO template or if we want a subtler subtitle
                !templateBase64 ? {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            marginBottom: '40px',
                        },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        fontSize: '28px',
                                        color: '#fff',
                                        fontWeight: 600,
                                        textAlign: 'center',
                                        textTransform: 'uppercase',
                                        letterSpacing: '1px',
                                    },
                                    children: title
                                }
                            },
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        width: '60px',
                                        height: '2px',
                                        backgroundColor: '#c5a363',
                                        marginTop: '15px',
                                    }
                                }
                            }
                        ]
                    }
                } : null,
                // Items List
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
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
                                        fontSize: '19px',
                                        padding: '12px 18px',
                                        backgroundColor: 'rgba(0, 0, 0, 0.45)', 
                                        border: '1px solid rgba(197, 163, 99, 0.25)',
                                        borderRadius: '12px',
                                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                        backdropFilter: 'blur(10px)', 
                                    },
                                    children: [
                                        {
                                            type: 'div',
                                            props: {
                                                style: { display: 'flex', alignItems: 'center', gap: '16px' },
                                                children: [
                                                    {
                                                        type: 'div',
                                                        props: {
                                                            style: { 
                                                                width: '36px',
                                                                height: '36px',
                                                                borderRadius: '18px',
                                                                backgroundColor: '#c5a363',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: '#000',
                                                                fontWeight: 'bold',
                                                                fontSize: '18px',
                                                            },
                                                            children: `${index + 1}`
                                                        }
                                                    },
                                                    {
                                                        type: 'span',
                                                        props: { 
                                                            style: { 
                                                                color: 'rgba(255,255,255,0.95)',
                                                                fontWeight: 500,
                                                            },
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
                                                    fontSize: '22px'
                                                },
                                                children: item.price ? `$${item.price}` : 'Consultar'
                                            }
                                        } : {
                                            type: 'div',
                                            props: {
                                                style: { color: 'rgba(197, 163, 99, 0.4)' },
                                                children: '→'
                                            }
                                        }
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
                            paddingTop: '30px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '5px',
                            borderTop: '1px solid rgba(197, 163, 99, 0.1)',
                        },
                        children: [
                            {
                                type: 'span',
                                props: {
                                    style: { 
                                        fontSize: '16px', 
                                        color: '#c5a363',
                                        fontWeight: 600,
                                        letterSpacing: '1px',
                                    },
                                    children: 'Respondé con el número'
                                }
                            },
                        ]
                    }
                }
            ],
        },
    };

    const svg = await satori(satoriConfig, {
        width: 600,
        height: finalHeight,
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
