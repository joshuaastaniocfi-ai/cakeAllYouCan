import sys
import os
from PIL import Image, ImageDraw, ImageFont

def generate_coupon(guest_name, control_no, output_path):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    tpl_path = os.path.join(base_dir, 'Assets', 'coupon-template.png')
    if not os.path.exists(tpl_path):
        tpl_path = os.path.join(base_dir, 'Assets', 'coupon-template.jpg')

    tpl = Image.open(tpl_path).convert('RGBA')
    # True High Definition 2x Retina canvas: 2048 x 930
    if tpl.size != (2048, 930):
        canvas = tpl.resize((2048, 930), Image.Resampling.LANCZOS)
    else:
        canvas = tpl.copy()

    draw = ImageDraw.Draw(canvas)

    # Load high-quality font across Windows, macOS, and Linux Docker
    def load_font(size):
        candidates = [
            'arialbd.ttf',
            'Arial Bold.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
            'DejaVuSans-Bold.ttf'
        ]
        for f in candidates:
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                continue
        try:
            return ImageFont.load_default(size=size)
        except Exception:
            return ImageFont.load_default()

    font_tr = load_font(24)
    font_stub = load_font(30)
    font_name = load_font(26)

    ctrl_str = str(control_no).strip()

    # 1. Overlay Top-Right Control Number (Seamlessly right after pre-printed 'CONTROL NUMBER:')
    # Pre-printed 'CONTROL NUMBER:' colon ends at X = 1786, Y = 30..52
    draw.text((1796, 31), ctrl_str, font=font_tr, fill=(180, 100, 0, 180))
    draw.text((1795, 30), ctrl_str, font=font_tr, fill=(255, 255, 255, 255))

    # 2. Overlay Cuttable Stub Control Number (Placed right under vertical 'CONTROL NUMBER:' with zero duplicate CAY)
    # Pre-printed colon ends at Y = 501. Clear space extends from Y = 520 down to Y = 900. Center X is 178.
    stub_txt_layer = Image.new('RGBA', (320, 44), (255, 255, 255, 0))
    d_stub = ImageDraw.Draw(stub_txt_layer)
    d_stub.text((2, 2), ctrl_str, font=font_stub, fill=(180, 100, 0, 180))
    d_stub.text((0, 0), ctrl_str, font=font_stub, fill=(255, 255, 255, 255))
    rot_stub = stub_txt_layer.rotate(270, expand=True)
    canvas.paste(rot_stub, (156, 520), rot_stub)

    # 3. Overlay Guest Name inside white vertical strip on stub (Dead-center inside white box)
    # White box is X: 17..70 (center ~43.5), Y: starts at ~145
    clean_name = (guest_name or 'GUEST').upper().strip()
    txt_layer = Image.new('RGBA', (700, 36), (255, 255, 255, 0))
    d_txt = ImageDraw.Draw(txt_layer)
    d_txt.text((0, 0), clean_name, font=font_name, fill=(59, 31, 0, 255))
    rot_txt = txt_layer.rotate(270, expand=True)
    canvas.paste(rot_txt, (25, 145), rot_txt)

    # Convert to RGB for saving if output is JPG, or save directly as PNG
    out_rgb = canvas.convert('RGB')
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    out_rgb.save(output_path, quality=96, optimize=True)
    print(f'COUPON_SAVED:{output_path}')

if __name__ == '__main__':
    name = sys.argv[1] if len(sys.argv) > 1 else 'JUAN DELA CRUZ'
    cno = sys.argv[2] if len(sys.argv) > 2 else 'CAYC0001'
    out = sys.argv[3] if len(sys.argv) > 3 else r'C:/Users/ASUS/Desktop/CakeAllYouCanPayment/uploads/coupons/test.png'
    generate_coupon(name, cno, out)
