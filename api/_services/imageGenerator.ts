import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';


let fontData: Buffer | null = null;
let secondaryFontData: Buffer | null = null;
let logoData: string | null = null;
let templateData: string | null = null;

// Function to get the primary font (Inter)
async function getFontData() {
    if (fontData) return fontData;
    const localFontPaths = [
        path.join(process.cwd(), 'public', 'fonts', 'Inter-SemiBold.ttf'),
        path.join(process.cwd(), 'public', 'fonts', 'Inter-Bold.ttf'),
    ];
    for (const p of localFontPaths) {
        if (fs.existsSync(p)) {
            fontData = fs.readFileSync(p);
            return fontData;
        }
    }
    try {
        const response = await fetch('https://github.com/google/fonts/raw/main/ofl/inter/static/Inter-SemiBold.ttf');
        const arrayBuffer = await response.arrayBuffer();
        fontData = Buffer.from(arrayBuffer);
    } catch (e) { console.error(e); }
    return fontData;
}

// Function to get the secondary font (Cinzel for Logo)
async function getSecondaryFontData() {
    if (secondaryFontData) return secondaryFontData;
    try {
        const response = await fetch('https://github.com/google/fonts/raw/main/ofl/cinzel/static/Cinzel-Bold.ttf');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        secondaryFontData = Buffer.from(arrayBuffer);
    } catch (e) {
        console.warn("[imageGenerator] Failed to fetch Cinzel, falling back to Inter bold", e);
        secondaryFontData = await getFontData();
    }
    return secondaryFontData;
}

function getLogoData() {
    if (logoData) return logoData;
    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoData = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }
    return logoData;
}

function getTemplateData() {
    if (templateData) return templateData;
    const templatePath = path.join(process.cwd(), 'public', 'template_chatbot.png');
    if (fs.existsSync(templatePath)) {
        templateData = `data:image/png;base64,${fs.readFileSync(templatePath).toString('base64')}`;
    }
    return templateData;
}

export async function generateMenuImage(title: string, items: { label: string, price?: string | number }[]) {
    const font = await getFontData();
    const cinzel = await getSecondaryFontData();
    const isotypeBase64 = getLogoData();
    
    if (!font || !cinzel) throw new Error("Missing fonts for Satori!");

    const isMainMenu = title.toUpperCase().includes('ESPECIALIDADES') || title.toUpperCase().includes('MEN');
    const isDepilacion = title.toLowerCase().includes('depil');
    
    if (!items || items.length === 0) {
        items = [{ label: "Consulta en el local", price: "Personalizado" }];
    }

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

    const itemHeight = 60;
    const itemsToShowHeight = Math.max(col1Items.length, col2Items.length);
    const finalHeight = Math.max(450 + (itemsToShowHeight * itemHeight), 700); 

    const renderItem = (item: any, index: number, isCol2: boolean = false) => {
        const isService = item.price !== undefined;
        const displayIndex = isCol2 ? (col1Items.length + index + 1) : (index + 1);
        const label = isMainMenu ? `${displayIndex}. ${item.label}` : item.label;

        return {
            type: 'div',
            props: {
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 0',
                    borderBottom: '1px solid rgba(93, 64, 55, 0.15)',
                    width: '100%',
                },
                children: [
                    {
                        type: 'div',
                        props: {
                            style: { display: 'flex', alignItems: 'center', flex: 1 },
                            children: [
                                {
                                    type: 'span',
                                    props: { 
                                        style: { 
                                            color: '#3d2b24',
                                            fontWeight: 600,
                                            fontSize: '17px',
                                            maxWidth: (useColumns || isDepilacion) ? '220px' : '450px',
                                            textTransform: isMainMenu ? 'uppercase' : 'none',
                                            letterSpacing: isMainMenu ? '1px' : '0.5px'
                                        },
                                        children: label.replace(/femenino/gi, '').replace(/masculino/gi, '').replace(/femenina/gi, '').trim()
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
                                fontSize: '18px',
                                marginLeft: '10px',
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
                // Premium Header Rendering
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '50px', width: '100%' },
                        children: [
                            isotypeBase64 ? {
                                type: 'img',
                                props: {
                                    src: isotypeBase64,
                                    style: { width: '80px', height: '80px', marginBottom: '5px' }
                                }
                            } : null,
                            {
                                type: 'div',
                                props: {
                                    style: { fontFamily: 'Cinzel', fontSize: '52px', color: '#c5a363', fontWeight: 700, letterSpacing: '8px', lineHeight: 1 },
                                    children: 'KÂLON'
                                }
                            },
                            {
                                type: 'div',
                                props: {
                                    style: { fontSize: '14px', color: '#3d2b24', fontWeight: 500, letterSpacing: '4px', textTransform: 'uppercase', marginTop: '4px' },
                                    children: 'MULTIESPACIO ESTÉTICO'
                                }
                            },
                            { 
                                type: 'div', 
                                props: { 
                                    style: { 
                                        fontSize: '24px', 
                                        color: '#3d2b24', 
                                        fontWeight: 700, 
                                        textAlign: 'center', 
                                        letterSpacing: '5px',
                                        textTransform: 'uppercase',
                                        marginTop: '40px',
                                        borderTop: '2px solid #c5a363',
                                        borderBottom: '2px solid #c5a363',
                                        padding: '10px 20px',
                                    }, 
                                    children: title.toUpperCase()
                                } 
                            }
                        ]
                    }
                },
                
                // Content
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', flexDirection: 'row', gap: '40px', width: '100%', flex: 1 },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', flexDirection: 'column', width: useColumns ? '48%' : '100%' },
                                    children: [
                                        isDepilacion ? {
                                            type: 'div',
                                            props: {
                                                style: { fontSize: '16px', fontWeight: 'bold', color: '#c5a363', marginBottom: '15px', borderBottom: '2px solid #c5a363', letterSpacing: '2px' },
                                                children: col1Title
                                            }
                                        } : null,
                                        ...col1Items.map((item, idx) => renderItem(item, idx))
                                    ]
                                }
                            },
                            useColumns ? {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', flexDirection: 'column', width: '48%' },
                                    children: [
                                        isDepilacion ? {
                                            type: 'div',
                                            props: {
                                                style: { fontSize: '16px', fontWeight: 'bold', color: '#c5a363', marginBottom: '15px', borderBottom: '2px solid #c5a363', letterSpacing: '2px' },
                                                children: col2Title
                                            }
                                        } : null,
                                        ...col2Items.map((item, idx) => renderItem(item, idx, true))
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
                            paddingTop: '40px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            width: '100%',
                            borderTop: '1px solid rgba(197, 163, 99, 0.3)'
                        },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: { fontSize: '13px', color: 'rgba(61, 43, 36, 0.6)', fontWeight: 600, letterSpacing: '2px' },
                                    children: 'RESERVA TU MOMENTO • CÓRDOBA, ARGENTINA'
                                }
                            }
                        ]
                    }
                }
            ],
        },
    };

    const svg = await satori(satoriConfig, {
        width: 700,
        height: finalHeight,
        fonts: [
            { name: 'Inter', data: font, weight: 600, style: 'normal' },
            { name: 'Cinzel', data: cinzel, weight: 700, style: 'normal' }
        ],
    });

    return new Resvg(svg).render().asPng();
}
