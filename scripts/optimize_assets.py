import os
from PIL import Image

def optimize_images():
    assets_dir = "src/assets"
    
    # 1. Optimize hero background
    hero_bg_png = os.path.join(assets_dir, "centro-kalon-estetica.png")
    hero_bg_jpg = os.path.join(assets_dir, "centro-kalon-estetica.jpg")
    
    if os.path.exists(hero_bg_png):
        print(f"Optimizing hero background: {hero_bg_png}...")
        img = Image.open(hero_bg_png)
        # Convert to RGB (JPEG doesn't support alpha)
        if img.mode in ('RGBA', 'LA'):
            background = Image.new('RGB', img.size, (10, 10, 10))
            background.paste(img, mask=img.split()[3]) # 3 is alpha channel
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
            
        # Resize to max 1920px width
        max_width = 1920
        if img.width > max_width:
            w_percent = (max_width / float(img.width))
            h_size = int((float(img.height) * float(w_percent)))
            img = img.resize((max_width, h_size), Image.Resampling.LANCZOS)
            
        # Save as progressive JPEG with quality 80
        img.save(hero_bg_jpg, "JPEG", quality=80, optimize=True, progressive=True)
        print(f"Saved optimized JPEG to: {hero_bg_jpg} ({os.path.getsize(hero_bg_jpg) / 1024:.2f} KB)")

    # 2. Optimize logo (must preserve transparency)
    logo_src = os.path.join(assets_dir, "logo kalon sin fondo.png")
    logo_dst = os.path.join(assets_dir, "logo_kalon_optimized.png")
    
    if os.path.exists(logo_src):
        print(f"Optimizing logo: {logo_src}...")
        img = Image.open(logo_src)
        
        # Resize to max 450px width (plenty for high-res rendering of a logo)
        max_width = 450
        if img.width > max_width:
            w_percent = (max_width / float(img.width))
            h_size = int((float(img.height) * float(w_percent)))
            img = img.resize((max_width, h_size), Image.Resampling.LANCZOS)
            
        # Convert to palette mode with transparency to heavily reduce file size
        img = img.convert("P", palette=Image.Palette.ADAPTIVE, colors=256)
        img.save(logo_dst, "PNG", optimize=True)
        print(f"Saved optimized logo to: {logo_dst} ({os.path.getsize(logo_dst) / 1024:.2f} KB)")

if __name__ == "__main__":
    optimize_images()
