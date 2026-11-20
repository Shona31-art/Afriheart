# Afriheart's own sticker pack: 16 original stickers in the brand colours, with South African
# phrases. Text is turned into outlines (Inter Display, SIL Open Font License), so the stickers
# look the same on every phone. Writes server/public/stickers/<id>.svg and pack.json.
#
#   python3 make-stickers.py      (needs: pip install fonttools)

import json, math, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

TEAL, CREAM, OCHRE, CLAY, INK, WHITE = "#0e5a52", "#f6f3ec", "#f2b134", "#d9573b", "#0b2f2b", "#ffffff"
OUT = os.path.join(os.path.dirname(__file__), "..", "server", "public", "stickers")
os.makedirs(OUT, exist_ok=True)
FONT = TTFont("/usr/share/fonts/opentype/inter/InterDisplay-Black.otf")
GS, CMAP, UPM = FONT.getGlyphSet(), FONT.getBestCmap(), FONT["head"].unitsPerEm
HEART = "M256 448 C 222 422 52 310 52 180 C 52 108 104 56 170 56 C 210 56 240 78 256 112 C 272 78 302 56 342 56 C 408 56 460 108 460 180 C 460 310 290 422 256 448 Z"


def text_width(s, size, track=-0.02):
    k = size / UPM
    return sum(GS[CMAP[ord(c)]].width * k + track * size for c in s) - track * size


def text(s, size, cx, baseline, fill, track=-0.02, max_w=None):
    """Centred outlined text. Shrinks to fit max_w."""
    if max_w:
        while text_width(s, size, track) > max_w:
            size -= 2
    k = size / UPM
    x = cx - text_width(s, size, track) / 2
    d = []
    for c in s:
        g = CMAP[ord(c)]
        pen = SVGPathPen(GS)
        GS[g].draw(TransformPen(pen, (k, 0, 0, -k, x, baseline)))
        d.append(pen.getCommands())
        x += GS[g].width * k + track * size
    return f'<path d="{" ".join(d)}" fill="{fill}"/>'


def die_cut(shape):
    """The white outline and soft shadow that make it look like a sticker."""
    return (
        f'<g transform="translate(0 8)" opacity=".18">{shape.replace("FILL", "#000")}</g>'
        f'<g stroke="{WHITE}" stroke-width="28" stroke-linejoin="round">{shape.replace("FILL", WHITE)}</g>'
    )


def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">{body}</svg>'


def bubble(x, y, w, h, r, tail_left=True):
    tx = x + 70 if tail_left else x + w - 70
    tail = f"M{tx - 30} {y + h - 4} L{tx - (42 if tail_left else -42)} {y + h + 58} L{tx + 34} {y + h - 4} Z"
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="FILL"/><path d="{tail}" fill="FILL"/>'


def star(cx, cy, r1, r2, n=14):
    pts = []
    for i in range(n * 2):
        a = math.pi * i / n - math.pi / 2
        r = r1 if i % 2 == 0 else r2
        pts.append(f"{cx + r * math.cos(a):.1f},{cy + r * math.sin(a):.1f}")
    return f'<polygon points="{" ".join(pts)}" fill="FILL"/>'


def triangles(x0, y, w, h, n, colour):
    step = w / n
    return "".join(f'<path d="M{x0 + i * step:.1f} {y + h} L{x0 + i * step + step / 2:.1f} {y} L{x0 + (i + 1) * step:.1f} {y + h} Z" fill="{colour}"/>' for i in range(n))


def heart_small(cx, cy, s, colour):
    return f'<path d="{HEART}" fill="{colour}" transform="translate({cx - 256 * s} {cy - 252 * s}) scale({s})"/>'


def flame(cx, cy, s, outer, inner):
    o = f"M{cx} {cy - 60 * s} C{cx + 40 * s} {cy - 20 * s} {cx + 36 * s} {cy + 30 * s} {cx} {cy + 34 * s} C{cx - 36 * s} {cy + 30 * s} {cx - 40 * s} {cy - 10 * s} {cx - 12 * s} {cy - 30 * s} C{cx - 8 * s} {cy - 10 * s} {cx + 2 * s} {cy - 30 * s} {cx} {cy - 60 * s} Z"
    i = f"M{cx} {cy - 18 * s} C{cx + 18 * s} {cy} {cx + 16 * s} {cy + 26 * s} {cx} {cy + 28 * s} C{cx - 16 * s} {cy + 26 * s} {cx - 16 * s} {cy + 6 * s} {cx} {cy - 18 * s} Z"
    return f'<path d="{o}" fill="{outer}"/><path d="{i}" fill="{inner}"/>'


S = {}  # id -> (label for screen readers, svg body)

# 1. Howzit! — teal speech bubble
sh = bubble(48, 120, 416, 210, 70)
S["howzit"] = ("Howzit!", die_cut(sh) + sh.replace("FILL", TEAL) + text("Howzit!", 112, 256, 262, CREAM, max_w=360) + triangles(110, 300, 292, 22, 8, OCHRE))

# 2. Lekker! — ochre starburst
sh = star(256, 256, 220, 182, 16)
S["lekker"] = ("Lekker!", die_cut(sh) + sh.replace("FILL", OCHRE) + text("Lekker!", 108, 256, 292, INK, max_w=330))

# 3. Eish... — clay bubble
sh = bubble(60, 130, 392, 200, 100, tail_left=False)
S["eish"] = ("Eish…", die_cut(sh) + sh.replace("FILL", CLAY) + text("Eish…", 124, 256, 272, CREAM, max_w=320))

# 4. Sharp sharp — teal pill with ochre text
sh = '<rect x="36" y="168" width="440" height="176" rx="88" fill="FILL"/>'
S["sharp-sharp"] = ("Sharp sharp", die_cut(sh) + sh.replace("FILL", TEAL) + text("Sharp", 92, 256, 248, OCHRE, max_w=330) + text("sharp!", 92, 256, 330, CREAM, max_w=330))

# 5. Braai? — ochre disc with flames
sh = '<circle cx="256" cy="256" r="210" fill="FILL"/>'
S["braai"] = ("Braai?", die_cut(sh) + sh.replace("FILL", OCHRE) + flame(176, 184, 1.1, CLAY, CREAM) + flame(256, 160, 1.4, CLAY, CREAM) + flame(336, 184, 1.1, CLAY, CREAM)
              + '<rect x="120" y="226" width="272" height="16" rx="8" fill="#0b2f2b"/>' + text("Braai?", 112, 256, 362, INK, max_w=330))

# 6. Now now — cream bubble, ink text, little clock
sh = bubble(56, 120, 400, 220, 80)
S["now-now"] = ("Now now", die_cut(sh) + sh.replace("FILL", CREAM) + text("Now now", 96, 256, 250, INK, max_w=330)
                + '<circle cx="256" cy="296" r="24" fill="none" stroke="#0e5a52" stroke-width="8"/><path d="M256 282 V298 L268 306" stroke="#0e5a52" stroke-width="8" fill="none" stroke-linecap="round"/>')

# 7. Yebo! — teal circle with a tick
sh = '<circle cx="256" cy="256" r="206" fill="FILL"/>'
S["yebo"] = ("Yebo!", die_cut(sh) + sh.replace("FILL", TEAL) + '<path d="M180 196 L236 248 L336 140" stroke="#f2b134" stroke-width="34" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' + text("Yebo!", 112, 256, 372, CREAM, max_w=320))

# 8. Hayibo! — clay starburst
sh = star(256, 256, 226, 186, 12)
S["hayibo"] = ("Hayibo!", die_cut(sh) + sh.replace("FILL", CLAY) + text("Hayibo!", 100, 256, 290, CREAM, max_w=340))

# 9. Miss you — the Afriheart heart with its band
band = triangles(40, 236, 432, 70, 12, CLAY)
sh = f'<path d="{HEART}" fill="FILL"/>'
S["miss-you"] = ("Miss you", die_cut(sh) + sh.replace("FILL", TEAL) + f'<clipPath id="mh"><path d="{HEART}"/></clipPath><g clip-path="url(#mh)"><rect x="40" y="236" width="432" height="70" fill="{OCHRE}"/>{band}</g>'
                 + text("Miss you", 70, 256, 196, CREAM, max_w=300))

# 10. Love you — clay heart
S["love-you"] = ("Love you", die_cut(sh) + sh.replace("FILL", CLAY) + text("Love", 96, 256, 230, CREAM, max_w=280) + text("you", 96, 256, 320, CREAM, max_w=240))

# 11. Date night? — ink badge with ochre text and hearts
sh = '<rect x="40" y="118" width="432" height="276" rx="60" fill="FILL"/>'
S["date-night"] = ("Date night?", die_cut(sh) + sh.replace("FILL", INK) + text("Date", 104, 256, 238, OCHRE, max_w=360) + text("night?", 104, 256, 338, CREAM, max_w=360)
                   + heart_small(96, 150, .09, CLAY) + heart_small(418, 362, .11, CLAY) + heart_small(420, 150, .07, OCHRE))

# 12. On my way — teal pill with an arrow
sh = '<rect x="28" y="176" width="456" height="160" rx="80" fill="FILL"/>'
S["on-my-way"] = ("On my way", die_cut(sh) + sh.replace("FILL", TEAL) + text("On my way", 74, 230, 282, CREAM, max_w=300)
                  + '<path d="M396 256 H446 M424 230 L450 256 L424 282" stroke="#f2b134" stroke-width="18" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')

# 13. Morning, love — ochre sun
rays = "".join(f'<rect x="246" y="20" width="20" height="70" rx="10" fill="{OCHRE}" transform="rotate({a} 256 256)"/>' for a in range(0, 360, 30))
sh = '<circle cx="256" cy="256" r="172" fill="FILL"/>'
S["morning-love"] = ("Morning, love", f'<g stroke="{WHITE}" stroke-width="20">{rays}</g>{rays}' + die_cut(sh) + sh.replace("FILL", OCHRE) + text("Morning,", 74, 256, 248, INK, max_w=300) + text("love", 96, 256, 336, CLAY, max_w=260))

# 14. Sleep tight — ink night sky with an ochre moon
sh = '<rect x="56" y="70" width="400" height="372" rx="80" fill="FILL"/>'
S["sleep-tight"] = ("Sleep tight", die_cut(sh) + sh.replace("FILL", INK)
                    + '<path d="M286 110 A84 84 0 1 0 344 236 A66 66 0 1 1 286 110 Z" fill="#f2b134"/>'
                    + '<circle cx="356" cy="132" r="7" fill="#f6f3ec"/><circle cx="168" cy="140" r="5" fill="#f6f3ec"/><circle cx="390" cy="196" r="5" fill="#f6f3ec"/>'
                    + text("Sleep tight", 76, 256, 340, CREAM, max_w=340) + heart_small(256, 392, .07, CLAY))

# 15. Ayeye! — party with Ndebele triangles
sh = '<rect x="48" y="132" width="416" height="248" rx="48" fill="FILL"/>'
S["ayeye"] = ("Ayeye!", die_cut(sh) + sh.replace("FILL", CREAM) + triangles(48, 132, 416, 46, 10, CLAY) + f'<rect x="48" y="132" width="416" height="10" fill="{OCHRE}"/>'
              + text("Ayeye!", 112, 256, 318, TEAL, max_w=360) + triangles(48, 334, 416, 46, 10, OCHRE).replace(f'fill="{OCHRE}"', f'fill="{OCHRE}" transform="rotate(180 256 357)"'))

# 16. Afriheart — the logo heart itself
S["afriheart"] = ("Afriheart heart", die_cut(sh := f'<path d="{HEART}" fill="FILL"/>') + sh.replace("FILL", TEAL)
                  + f'<clipPath id="ah"><path d="{HEART}"/></clipPath><g clip-path="url(#ah)"><rect x="40" y="236" width="432" height="70" fill="{OCHRE}"/>{triangles(-77, 236, 666, 70, 9, CLAY)}'
                  + f'<rect x="40" y="226" width="432" height="10" fill="{CREAM}"/><rect x="40" y="306" width="432" height="10" fill="{CREAM}"/></g>')

pack = []
for sid, (label, body) in S.items():
    open(os.path.join(OUT, f"{sid}.svg"), "w").write(svg(body))
    pack.append({"id": sid, "label": label})
json.dump({"id": "afriheart", "name": "Afriheart", "stickers": pack}, open(os.path.join(OUT, "pack.json"), "w"), indent=1)
print(f"{len(pack)} stickers written to {os.path.normpath(OUT)}")
