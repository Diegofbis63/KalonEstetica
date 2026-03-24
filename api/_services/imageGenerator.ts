
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
    // Forcing an absolute path check to be extra safe on locals, but process.cwd() is standard for Vercel.
    const logoPaths = [
        path.join(process.cwd(), 'public', 'logo.png'),
        'E:\\Antigravity Projects\\KalonEstetica\\public\\logo.png', // User local absolute
        '/var/task/public/logo.png' // Vercel absolute
    ];
    
    for (const lp of logoPaths) {
        if (fs.existsSync(lp)) {
            const logoBuffer = fs.readFileSync(lp);
            logoData = `data:image/png;base64,${logoBuffer.toString('base64')}`;
            break;
        }
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
    if (!font) throw new Error("No font for Satori!");

    const isDepilacion = title.toLowerCase().includes('depil');
    
    // Safety check for empty data
    if (!items || items.length === 0) {
        console.error(`[Satori Error] No services provided for category: ${title}`);
        items = [{ label: "Consulta en el local", price: "Personalizado" }];
    }

    // Split items for Depilación or general 2-column mode
    let col1Items = items;
    let col2Items: typeof items = [];
    const useColumns = items.length > 8 || isDepilacion;
    let col1Title = "";
    let col2Title = "";

    if (isDepilacion) {
        col1Title = "FEMENINO";
        col2Title = "MASCULINO";
        col1Items = items.filter(i => i.label.toLowerCase().includes('fem') || (!i.label.toLowerCase().includes('masc') && !i.label.toLowerCase().includes('hombre')));
        col2Items = items.filter(i => i.label.toLowerCase().includes('masc') || i.label.toLowerCase().includes('hombre'));
    } else if (useColumns) {
        const itemsPerCol = Math.ceil(items.length / 2);
        col1Items = items.slice(0, itemsPerCol);
        col2Items = items.slice(itemsPerCol);
    }

    // Dynamic height calculation
    const itemHeight = 55;
    const itemsToShowHeight = Math.max(col1Items.length, col2Items.length);
    const calculatedHeight = 250 + (itemsToShowHeight * itemHeight); 
    const finalHeight = Math.max(calculatedHeight, 600); 

    const renderItem = (item: any) => {
        const isService = item.price !== undefined;
        return {
            type: 'div',
            props: {
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 4px',
                    borderBottom: '1px solid rgba(93, 64, 55, 0.1)',
                    width: '100%',
                },
                children: [
                    {
                        type: 'div',
                        props: {
                            style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1 },
                            children: [
                                {
                                    type: 'span',
                                    props: { 
                                        style: { 
                                            color: '#5D4037',
                                            fontWeight: 500,
                                            fontSize: '15px',
                                            maxWidth: (useColumns || isDepilacion) ? '180px' : '380px',
                                            overflow: 'hidden',
                                            whiteSpace: 'nowrap',
                                            textOverflow: 'ellipsis',
                                        },
                                        children: item.label.replace(/femenino/gi, '').replace(/masculino/gi, '').replace(/femenina/gi, '').trim()
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
                                fontSize: '16px',
                                marginLeft: '8px',
                                whiteSpace: 'nowrap'
                            },
                            children: item.price ? (item.price.toString().startsWith('$') ? item.price : `$${item.price}`) : 'Consultar'
                        }
                    } : null
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
                backgroundColor: '#F2EBE3', 
                color: '#5D4037', 
                padding: '40px',
                fontFamily: 'Inter',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '0px',
            },
            children: [
                // Header with Logo
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '30px', width: '100%' },
                        children: [
                            logoBase64 ? {
                                type: 'img',
                                props: {
                                    src: logoBase64,
                                    style: { width: '180px', marginBottom: '20px' }
                                }
                            } : null,
                            { 
                                type: 'div', 
                                props: { 
                                    style: { 
                                        fontSize: '28px', 
                                        color: '#5D4037', 
                                        fontWeight: 700, 
                                        textAlign: 'center', 
                                        letterSpacing: '3px',
                                        textTransform: 'uppercase'
                                    }, 
                                    children: title 
                                } 
                            },
                            { type: 'div', props: { style: { width: '60px', height: '2px', backgroundColor: '#c5a363', marginTop: '10px' } } }
                        ]
                    }
                },
                
                // Content Wrapper (Row if 2 cols)
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'row',
                            gap: '30px',
                            width: '100%',
                            justifyContent: 'space-between',
                            flex: 1,
                        },
                        children: [
                            // Column 1
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', flexDirection: 'column', width: useColumns ? '47%' : '100%' },
                                    children: [
                                        isDepilacion ? {
                                            type: 'div',
                                            props: {
                                                style: { fontSize: '16px', fontWeight: 'bold', color: '#c5a363', marginBottom: '15px', borderBottom: '2px solid #c5a363', paddingBottom: '3px', letterSpacing: '2px' },
                                                children: col1Title
                                            }
                                        } : null,
                                        ...col1Items.map((item) => renderItem(item))
                                    ]
                                }
                            },
                            // Column 2
                            useColumns ? {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', flexDirection: 'column', width: '47%' },
                                    children: [
                                        isDepilacion ? {
                                            type: 'div',
                                            props: {
                                                style: { fontSize: '16px', fontWeight: 'bold', color: '#c5a363', marginBottom: '15px', borderBottom: '2px solid #c5a363', paddingBottom: '3px', letterSpacing: '2px' },
                                                children: col2Title
                                            }
                                        } : null,
                                        ...col2Items.map((item) => renderItem(item))
                                    ]
                                }
                            } : null
                        ]
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
                            width: '100%'
                        },
                        children: [
                            { 
                                type: 'span', 
                                props: { 
                                    style: { 
                                        fontSize: '15px', 
                                        color: '#c5a363', 
                                        fontWeight: 700, 
                                        letterSpacing: '2px',
                                        textTransform: 'uppercase'
                                    }, 
                                    children: 'KÂLON MULTIESPACIO ESTÉTICO' 
                                } 
                            },
                            {
                                type: 'div',
                                props: {
                                    style: { fontSize: '12px', color: 'rgba(93, 64, 55, 0.7)', fontWeight: 500 },
                                    children: 'Reserva tu momento • Córdoba, Argentina'
                                }
                            }
                        ]
                    }
                }
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
