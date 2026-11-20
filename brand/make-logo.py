# Builds the Afriheart logo SVGs.
HEART = "M256 448 C 222 422 52 310 52 180 C 52 108 104 56 170 56 C 210 56 240 78 256 112 C 272 78 302 56 342 56 C 408 56 460 108 460 180 C 460 310 290 422 256 448 Z"
TEAL, CREAM, OCHRE, CLAY, INK = "#0e5a52", "#f6f3ec", "#f2b134", "#d9573b", "#0b2f2b"

def band(y0, h, base, tri, stripe):
    # A Ndebele-style band: base colour, a row of triangles, thin stripes above and below.
    out = [f'<rect x="40" y="{y0}" width="432" height="{h}" fill="{base}"/>']
    w = 74
    for i in range(-1, 8):
        x = 256 - 3.5 * w + i * w
        out.append(f'<path d="M{x} {y0+h} L{x+w/2} {y0} L{x+w} {y0+h} Z" fill="{tri}"/>')
    out.append(f'<rect x="40" y="{y0-10}" width="432" height="10" fill="{stripe}"/>')
    out.append(f'<rect x="40" y="{y0+h}" width="432" height="10" fill="{stripe}"/>')
    return "\n".join(out)

def heart(fill, b):
    return f'''<defs><clipPath id="h"><path d="{HEART}"/></clipPath></defs>
<path d="{HEART}" fill="{fill}"/>
<g clip-path="url(#h)">{b}</g>'''

def svg(body, bg=None, size=512, radius=112):
    r = f'<rect width="512" height="512" rx="{radius}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{size}" height="{size}">{r}{body}</svg>'

# Mark on its own (cream backgrounds): teal heart, ochre band with clay triangles.
mark = heart(TEAL, band(236, 70, OCHRE, CLAY, CREAM))
open("afriheart-mark.svg", "w").write(svg(mark))
# App icon: teal tile, cream heart, band in clay and ochre.
icon_body = f'<g transform="translate(256 262) scale(.78) translate(-256 -256)">{heart(CREAM, band(236, 70, OCHRE, CLAY, TEAL))}</g>'
open("afriheart-icon.svg", "w").write(svg(icon_body, bg=TEAL))
# Maskable icon (Android): no rounding, heart smaller so it survives any mask shape.
mask_body = f'<g transform="translate(256 262) scale(.62) translate(-256 -256)">{heart(CREAM, band(236, 70, OCHRE, CLAY, TEAL))}</g>'
open("afriheart-maskable.svg", "w").write(svg(mask_body, bg=TEAL, radius=0))
# Monochrome (status bar, one-colour print).
mono = f'''<defs><clipPath id="h"><path d="{HEART}"/></clipPath>
<mask id="m"><g clip-path="url(#h)"><rect width="512" height="512" fill="#fff"/>{band(236, 70, "#000", "#fff", "#000")}</g></mask></defs>
<rect width="512" height="512" fill="{INK}" mask="url(#m)"/>'''
open("afriheart-mono.svg", "w").write(svg(mono))
# Wordmark lockup.
lock = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1240 360" width="1240" height="360">
<rect width="1240" height="360" fill="{CREAM}"/>
<g transform="translate(40 30) scale(.58)">{mark}</g>
<text x="360" y="232" font-family="Fraunces, Georgia, serif" font-size="150" font-weight="600" fill="{INK}" letter-spacing="-3">afri<tspan fill="{CLAY}">heart</tspan></text>
</svg>'''
open("afriheart-wordmark.svg", "w").write(lock)

# Wordmark: "afriheart" in Inter Display Bold (SIL Open Font License), turned into outlines so it
# looks the same everywhere, with no font needed. "afri" in ink, "heart" in clay.
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

def word(parts, size, x0, baseline, track=-0.02):
    f = TTFont("/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf")
    gs, cmap, upm = f.getGlyphSet(), f.getBestCmap(), f["head"].unitsPerEm
    k = size / upm
    x, out = x0, []
    for text, colour in parts:
        d = []
        for ch in text:
            g = cmap[ord(ch)]
            pen = SVGPathPen(gs)
            gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x, baseline)))
            d.append(pen.getCommands())
            x += gs[g].width * k + track * size
        out.append(f'<path d="{" ".join(d)}" fill="{colour}"/>')
    return "".join(out), x

def lockup(bg, ink, clay, markbody, name):
    w, end = word([("afri", ink), ("heart", clay)], 168, 318, 238)
    W = int(end + 48)
    bgr = f'<rect width="{W}" height="340" fill="{bg}"/>' if bg else ""
    open(name, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} 340" width="{W}" height="340">{bgr}<g transform="translate(36 34) scale(.53)">{markbody}</g>{w}</svg>')

lockup(CREAM, INK, CLAY, mark, "afriheart-wordmark.svg")
# On dark backgrounds: cream word, cream heart with the teal stripes.
lockup(TEAL, CREAM, OCHRE, heart(CREAM, band(236, 70, OCHRE, CLAY, TEAL)), "afriheart-wordmark-dark.svg")

# The in-app logo: switches to a cream heart with teal stripes when the phone is in dark mode.
app = heart(TEAL, band(236, 70, OCHRE, CLAY, CREAM))
app = app.replace(f'<path d="{HEART}" fill="{TEAL}"/>', f'<path class="h" d="{HEART}" fill="{TEAL}"/>')
app = app.replace(f'fill="{CREAM}"/>', f'class="s" fill="{CREAM}"/>')
style = f'<style>@media (prefers-color-scheme: dark) {{ .h {{ fill: {CREAM} }} .s {{ fill: {TEAL} }} }}</style>'
open("afriheart-mark-app.svg", "w").write(svg(style + app))
