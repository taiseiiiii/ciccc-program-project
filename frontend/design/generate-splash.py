#!/usr/bin/env python3
"""Generate iOS launch images (apple-touch-startup-image) from the app icon.

iOS matches each <link rel="apple-touch-startup-image"> by an exact
device-width / device-height / pixel-ratio media query. A resolution with no
matching image gets no launch screen at all, so one image per device class is
the only way to cover the fleet — hence the table below rather than a single
tall picture.

Each image is just the icon's background colour with the icon artwork centred
on it, so nothing new has to be drawn. Run from the frontend/ directory:

    python3 design/generate-splash.py

Writes public/splash/*.png and prints the <link> tags for index.html.
Portrait only: the manifest pins orientation to portrait, and covering
landscape too would double the file count for a case the app never uses.
"""

from PIL import Image, ImageChops

SOURCE = "design/icon-source.png"
OUT_DIR = "public/splash"

# Fraction of the screen's shorter side taken up by the logo's width.
LOGO_SCALE = 0.40

# (css_width, css_height, pixel_ratio, label) — portrait, current + recent iOS devices.
DEVICES = [
    (320, 568, 2, "iPhone SE (1st gen), 5s"),
    (375, 667, 2, "iPhone SE (2nd/3rd gen), 8"),
    (414, 736, 3, "iPhone 8 Plus"),
    (375, 812, 3, "iPhone X, XS, 11 Pro, 12/13 mini"),
    (414, 896, 2, "iPhone XR, 11"),
    (414, 896, 3, "iPhone XS Max, 11 Pro Max"),
    (390, 844, 3, "iPhone 12, 13, 14"),
    (428, 926, 3, "iPhone 12/13 Pro Max, 14 Plus"),
    (393, 852, 3, "iPhone 14 Pro, 15, 16"),
    (430, 932, 3, "iPhone 14 Pro Max, 15 Plus, 16 Plus"),
    (402, 874, 3, "iPhone 16 Pro"),
    (440, 956, 3, "iPhone 16 Pro Max"),
    (744, 1133, 2, "iPad mini (6th gen)"),
    (768, 1024, 2, "iPad 9.7, mini (5th gen)"),
    (810, 1080, 2, "iPad 10.2"),
    (820, 1180, 2, "iPad Air 10.9, iPad (10th gen)"),
    (834, 1112, 2, "iPad Pro 10.5"),
    (834, 1194, 2, "iPad Pro 11"),
    (1024, 1366, 2, "iPad Pro 12.9"),
]


def sample_background(im):
    """Median colour of the outer border, so generator noise can't skew it."""
    w, h = im.size
    band = 8
    px = (
        [im.getpixel((x, y)) for y in range(band) for x in range(0, w, 4)]
        + [im.getpixel((x, h - 1 - y)) for y in range(band) for x in range(0, w, 4)]
        + [im.getpixel((x, y)) for x in range(band) for y in range(0, h, 4)]
        + [im.getpixel((w - 1 - x, y)) for x in range(band) for y in range(0, h, 4)]
    )
    return tuple(sorted(c[i] for c in px)[len(px) // 2] for i in range(3))


def extract_logo(im, bg):
    """Crop to the artwork. Cropping to its bounding box also re-centres it —
    the source image sits a little right of centre."""
    diff = ImageChops.difference(im, Image.new("RGB", im.size, bg)).convert("L")
    bbox = diff.point(lambda v: 255 if v > 12 else 0).getbbox()
    return im.crop(bbox)


def main():
    import os

    im = Image.open(SOURCE).convert("RGB")
    bg = sample_background(im)
    logo = extract_logo(im, bg)
    print(f"background: #{bg[0]:02x}{bg[1]:02x}{bg[2]:02x}  logo: {logo.size[0]}x{logo.size[1]}")

    os.makedirs(OUT_DIR, exist_ok=True)
    links = []

    for cw, ch, ratio, label in DEVICES:
        w, h = cw * ratio, ch * ratio
        canvas = Image.new("RGB", (w, h), bg)

        lw = int(min(w, h) * LOGO_SCALE)
        lh = round(lw * logo.size[1] / logo.size[0])
        canvas.paste(logo.resize((lw, lh), Image.LANCZOS), ((w - lw) // 2, (h - lh) // 2))

        name = f"apple-splash-{w}x{h}.png"
        # Flat artwork: a 64-colour palette is visually identical and far smaller.
        canvas.quantize(colors=64, method=Image.MEDIANCUT).save(
            f"{OUT_DIR}/{name}", optimize=True
        )

        links.append(
            f'    <!-- {label} -->\n'
            f'    <link\n'
            f'      rel="apple-touch-startup-image"\n'
            f'      media="(device-width: {cw}px) and (device-height: {ch}px) and '
            f'(-webkit-device-pixel-ratio: {ratio}) and (orientation: portrait)"\n'
            f'      href="/splash/{name}"\n'
            f'    />'
        )

    with open("design/splash-links.html", "w") as f:
        f.write("\n".join(links) + "\n")
    print(f"wrote {len(DEVICES)} images to {OUT_DIR}/ and tags to design/splash-links.html")


if __name__ == "__main__":
    main()
