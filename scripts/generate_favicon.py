#!/usr/bin/env python3
"""
Generate favicon.ico and PNG variants from a simple soccer ball design.
Uses Pillow - no external dependencies for SVG parsing.
"""
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Pillow required: pip install Pillow")
    raise

STATIC_DIR = Path(__file__).parent.parent / "static"


def draw_soccer_ball(draw, size: int, cx: float, cy: float, r: float):
    """Draw a minimal soccer ball (circle + center pentagon) at given position."""
    # White circle outline
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill="white", outline="#1a1a1a", width=max(1, size // 16))
    # Center pentagon (simplified as small filled circle at tiny sizes)
    inner_r = r * 0.35
    if size >= 32:
        # Pentagonal shape
        import math
        points = []
        for i in range(5):
            angle = math.radians(-90 + i * 72)
            x = cx + inner_r * math.cos(angle)
            y = cy + inner_r * math.sin(angle)
            points.append((x, y))
        draw.polygon(points, fill="#1a1a1a")
    else:
        draw.ellipse([cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r], fill="#1a1a1a")


def create_favicon_png(size: int) -> Image.Image:
    """Create a favicon image at the given size."""
    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2
    r = (size - 2) / 2
    draw_soccer_ball(draw, size, cx, cy, r)
    return img


def main():
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    # 16x16 and 32x32 for ICO
    img16 = create_favicon_png(16)
    img32 = create_favicon_png(32)

    # Save favicon.ico (multi-size)
    ico_path = STATIC_DIR / "favicon.ico"
    img32.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32)])
    print(f"Created {ico_path}")

    # Save PNG variants
    for size in [16, 32, 180]:
        img = create_favicon_png(size)
        png_path = STATIC_DIR / f"favicon-{size}x{size}.png"
        img.save(png_path, format="PNG")
        print(f"Created {png_path}")

    # Apple touch icon
    apple_path = STATIC_DIR / "apple-touch-icon.png"
    img180 = create_favicon_png(180)
    img180.save(apple_path, format="PNG")
    print(f"Created {apple_path}")


if __name__ == "__main__":
    main()
