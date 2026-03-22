
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

    // Layout Intelligence: 2-column mode for lists > 10 items
    const useColumns = items.length > 10;
    const itemsPerCol = Math.ceil(items.length / (useColumns ? 2 : 1));
    const col1Items = items.slice(0, itemsPerCol);
    const col2Items = items.slice(itemsPerCol);

    // Dynamic height calculation
    const itemHeight = templateBase64 ? (useColumns ? 62 : 68) : (useColumns ? 70 : 80);
    const calculatedHeight = (templateBase64 ? 320 : 280) + (itemsPerCol * itemHeight); 
    const finalHeight = Math.max(calculatedHeight, 600); 

    const renderItem = (item: any, globalIndex: number) => {
        const isService = item.price !== undefined;
        return {
            type: 'div',
            props: {
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: useColumns ? '10px 12px' : '12px 18px',
                    backgroundColor: 'rgba(0, 0, 0, 0.45)', 
                    border: '1px solid rgba(197, 163, 99, 0.25)',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                },
                children: [
                    {
                        type: 'div',
                        props: {
                            style: { display: 'flex', alignItems: 'center', gap: useColumns ? '8px' : '16px' },
                            children: [
                                {
                                    type: 'div',
                                    props: {
                                        style: { 
                                            width: useColumns ? '26px' : '36px',
                                            height: useColumns ? '26px' : '36px',
                                            borderRadius: useColumns ? '13px' : '18px',
                                            backgroundColor: '#c5a363',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#000',
                                            fontWeight: 'bold',
                                            fontSize: useColumns ? '14px' : '18px',
                                        },
                                        children: `${globalIndex + 1}`
                                    }
                                },
                                {
                                    type: 'span',
                                    props: { 
                                        style: { 
                                            color: 'rgba(255,255,255,0.95)',
                                            fontWeight: 500,
                                            fontSize: useColumns ? '14px' : '19px',
                                            maxWidth: useColumns ? '170px' : '360px',
                                            overflow: 'hidden',
                                            whiteSpace: 'nowrap',
                                            textOverflow: 'ellipsis',
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
                                fontSize: useColumns ? '14px' : '22px',
                                marginLeft: 'auto',
                                whiteSpace: 'nowrap'
                            },
                            children: item.price ? `$${item.price}` : 'Consultar'
                        }
                    } : {
                        type: 'div',
                        props: {
                            style: { color: 'rgba(197, 163, 99, 0.4)', marginLeft: 'auto' },
                            children: '→'
                        }
                    }
                ]
            }
        };
    };

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
                padding: templateBase64 ? '210px 40px 60px 40px' : '60px 40px',
                fontFamily: 'Inter',
                backgroundImage: templateBase64 ? `url(${templateBase64})` : 'radial-gradient(circle at 50% 10%, #1a1a1a 0%, #050505 100%)',
                backgroundSize: '100% 100%',
                position: 'relative',
                overflow: 'hidden',
            },
            children: [
                // Stylized Title Section
                !templateBase64 ? {
                    type: 'div',
                    props: {
                        style: { 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            marginBottom: useColumns ? '30px' : '40px',
                            width: '100%' 
                        },
                        children: [
                            { 
                                type: 'div', 
                                props: { 
                                    style: { 
                                        fontSize: useColumns ? '26px' : '32px', 
                                        color: '#fff', 
                                        fontWeight: 700, 
                                        textAlign: 'center', 
                                        textTransform: 'uppercase', 
                                        letterSpacing: '2px',
                                        textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                                    }, 
                                    children: title 
                                } 
                            },
                            { type: 'div', props: { style: { width: '80px', height: '3px', backgroundColor: '#c5a363', marginTop: '12px', borderRadius: '2px' } } }
                        ]
                    }
                } : null,
                
                // MULTICOLUMN / SINGLE COLUMN RENDERER
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: useColumns ? 'row' : 'column',
                            gap: useColumns ? '15px' : '18px',
                            width: '100%',
                            justifyContent: 'space-between',
                            flex: 1
                        },
                        children: useColumns 
                            ? [
                                // Column 1
                                {
                                    type: 'div',
                                    props: {
                                        style: { display: 'flex', flexDirection: 'column', gap: '15px', width: '48.5%' },
                                        children: col1Items.map((item, index) => renderItem(item, index))
                                    }
                                },
                                // Column 2
                                {
                                    type: 'div',
                                    props: {
                                        style: { display: 'flex', flexDirection: 'column', gap: '15px', width: '48.5%' },
                                        children: col2Items.map((item, index) => renderItem(item, itemsPerCol + index))
                                    }
                                }
                            ]
                            : items.map((item, index) => renderItem(item, index))
                    }
                },
                
                // FOOTER
                !templateBase64 ? {
                    type: 'div',
                    props: {
                        style: {
                            marginTop: 'auto',
                            paddingTop: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            minHeight: '60px'
                        },
                        children: [
                            { 
                                type: 'span', 
                                props: { 
                                    style: { 
                                        fontSize: '17px', 
                                        color: '#c5a363', 
                                        fontWeight: 600, 
                                        letterSpacing: '1.5px',
                                        textTransform: 'uppercase'
                                    }, 
                                    children: 'Respondé con el número' 
                                } 
                            },
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        fontSize: '13px',
                                        color: 'rgba(197, 163, 99, 0.6)',
                                        letterSpacing: '0.5px'
                                    },
                                    children: 'KÂLON Estética • Salta, Argentina'
                                }
                            }
                        ]
                    }
                } : null
            ],
        },
    };


    const svg = await satori(satoriConfig, {
        width: 600,
        height: finalHeight,
        fonts: [{ name: 'Inter', data: font, weight: 600, style: 'normal' }],
    });

    const resvg = new Resvg(svg);
    return resvg.render().asPng();
}
