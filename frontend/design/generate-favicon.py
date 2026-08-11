#!/usr/bin/env python3
"""Generate favicon.ico from the app icon.

The PWA icons keep a wide margin because Android masks them to a circle. A
favicon is never masked and renders as small as 16px, so it gets its own tight
crop instead — reusing the padded artwork would leave the logo a few pixels
wide. Run from the frontend/ directory:

    python3 design/generate-favicon.py
"""

from PIL import Image, ImageChops

SOURCE = "design/icon-source.png"
OUT = "public/favicon.ico"

# Sizes packed into the .ico. Browsers and OS surfaces pick what they need.
SIZES = [16, 32, 48, 64]

# Logo width as a fraction of the square — near edge-to-edge, unlike the PWA icons.
FILL = 0.88


def main():
    im = Image.open(SOURCE).convert("RGB")
    w, h = im.size

    band = 8
    px = [im.getpixel((x, y)) for y in range(band) for x in range(0, w, 4)]
    bg = tuple(sorted(c[i] for c in px)[len(px) // 2] for i in range(3))

    diff = ImageChops.difference(im, Image.new("RGB", im.size, bg)).convert("L")
    logo = im.crop(diff.point(lambda v: 255 if v > 12 else 0).getbbox())

    # Render once at the largest size and let save() derive the rest, so every
    # entry comes from the same downscale of the original rather than of a
    # previous step.
    side = max(SIZES)
    canvas = Image.new("RGB", (side, side), bg)
    lw = int(side * FILL)
    lh = round(lw * logo.size[1] / logo.size[0])
    canvas.paste(logo.resize((lw, lh), Image.LANCZOS), ((side - lw) // 2, (side - lh) // 2))

    canvas.save(OUT, format="ICO", sizes=[(s, s) for s in SIZES])
    print(f"wrote {OUT} with sizes {SIZES}, background #{bg[0]:02x}{bg[1]:02x}{bg[2]:02x}")


if __name__ == "__main__":
    main()
