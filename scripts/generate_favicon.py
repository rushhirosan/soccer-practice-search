#!/usr/bin/env python3
"""
Generate favicon from soccer ball image.
- soccer_ref.png が static/ にあればリサイズして使用（推奨）
- なければ自前描画のクラシックパターンで生成

参照画像の取得: https://icon-pit.com/ でサッカーボールを検索し
static/soccer_ref.png として保存してから実行
"""
import math
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Pillow required: pip install Pillow")
    raise

STATIC_DIR = Path(__file__).parent.parent / "static"
REF_IMAGE = STATIC_DIR / "soccer_ref.png"
DARK = "#444444"


def create_from_reference(size: int) -> "Image.Image":
    """参照画像をリサイズして favicon を生成"""
    src = Image.open(REF_IMAGE).convert("RGBA")
    return src.resize((size, size), Image.Resampling.LANCZOS)


def polygon_points(cx: float, cy: float, r: float, n: int, phase_deg: float = -90) -> list:
    """正多角形の頂点座標"""
    return [
        (cx + r * math.cos(math.radians(phase_deg + i * 360 / n)),
         cy + r * math.sin(math.radians(phase_deg + i * 360 / n)))
        for i in range(n)
    ]


def draw_soccer_ball(draw, size: int):
    """Classic pattern: 中央五角形 + 5六角形 + 5外側五角形"""
    cx, cy = size / 2, size / 2
    R = (size - 2) / 2
    scale = R / 30

    draw.ellipse([cx - R, cy - R, cx + R, cy + R], fill="white", outline=DARK, width=max(1, size // 24))

    r_center = 10 * scale
    center_pts = polygon_points(cx, cy, r_center, 5, phase_deg=-90)
    draw.polygon(center_pts, fill=DARK, outline=DARK)

    r_hex_center, r_hex, r_outer_pent = 20 * scale, 8 * scale, 11 * scale
    for i in range(5):
        angle_hex = -54 + i * 72
        hx = cx + r_hex_center * math.cos(math.radians(angle_hex))
        hy = cy + r_hex_center * math.sin(math.radians(angle_hex))
        hex_pts = polygon_points(hx, hy, r_hex, 6, phase_deg=angle_hex + 90)
        draw.polygon(hex_pts, fill="white", outline=DARK)

        angle_outer = -90 + i * 72
        ox = cx + 25 * scale * math.cos(math.radians(angle_outer))
        oy = cy + 25 * scale * math.sin(math.radians(angle_outer))
        outer_pts = polygon_points(ox, oy, r_outer_pent, 5, phase_deg=angle_outer)
        draw.polygon(outer_pts, fill=DARK, outline=DARK)


def create_drawn(size: int) -> "Image.Image":
    """描画で favicon を生成（参照画像がない場合のフォールバック）"""
    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw_soccer_ball(ImageDraw.Draw(img), size)
    return img


def create_favicon_png(size: int) -> "Image.Image":
    """Create favicon - 参照画像があれば使用、なければ描画"""
    if REF_IMAGE.exists():
        return create_from_reference(size)
    return create_drawn(size)


def main():
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    img16 = create_favicon_png(16)
    img32 = create_favicon_png(32)

    ico_path = STATIC_DIR / "favicon.ico"
    img32.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32)])
    print(f"Created {ico_path}")

    for size in [16, 32, 180]:
        img = create_favicon_png(size)
        img.save(STATIC_DIR / f"favicon-{size}x{size}.png", format="PNG")
        print(f"Created favicon-{size}x{size}.png")

    img180 = create_favicon_png(180)
    img180.save(STATIC_DIR / "apple-touch-icon.png", format="PNG")
    print("Created apple-touch-icon.png")


if __name__ == "__main__":
    main()
