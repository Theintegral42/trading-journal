"""Génère les icônes de l'app (PNG). Usage : python make_icons.py"""
from PIL import Image, ImageDraw

S = 1024  # rendu haute résolution puis réduction (anti-aliasing)


def gradient(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    c1, c2 = (59, 130, 246), (124, 92, 255)
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return img


def draw_icon(rounded: bool, scale: float):
    bg = gradient(S)
    d = ImageDraw.Draw(bg)
    # tendance haussière (trending-up), centrée dans la zone sûre
    pts = [(0.22, 0.68), (0.42, 0.48), (0.55, 0.60), (0.78, 0.33)]
    off = (1 - scale) / 2
    p = [((off + x * scale) * S, (off + y * scale) * S) for x, y in pts]
    w = int(0.07 * S * scale)
    d.line(p, fill="white", width=w, joint="curve")
    for (x, y) in (p[0], p[-1]):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill="white")
    ax, ay = p[-1]
    a = 0.12 * S * scale
    d.line([(ax - a, ay), (ax, ay), (ax, ay + a)], fill="white", width=w, joint="curve")
    if not rounded:
        return bg
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)
    return out


def save(img, name, size):
    img.resize((size, size), Image.LANCZOS).save(f"icons/{name}", optimize=True)


save(draw_icon(True, 1.0), "icon-192.png", 192)
save(draw_icon(True, 1.0), "icon-512.png", 512)
save(draw_icon(False, 0.78), "icon-maskable-512.png", 512)
save(draw_icon(False, 0.9), "apple-touch-icon.png", 180)
print("ok")
