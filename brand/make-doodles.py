# The Afriheart chat wallpaper: a tile of hand-drawn-style line doodles (hearts, Ndebele
# triangles, braai flames, sun, moon, music, coffee, chat bubbles, stars, a protea, a camera, a
# ring). Original drawings. Writes server/public/doodle-light.svg and doodle-dark.svg.
import os, random
OUT = os.path.join(os.path.dirname(__file__), "..", "server", "public")
random.seed(7)

HEART = "M0 6 C-4 3 -10 -1 -10 -6 C-10 -10 -7 -12 -4.5 -12 C-2.5 -12 -0.8 -10.8 0 -9 C0.8 -10.8 2.5 -12 4.5 -12 C7 -12 10 -10 10 -6 C10 -1 4 3 0 6 Z"
D = {
    "heart": f'<path d="{HEART}"/>',
    "triangles": '<path d="M-16 6 L-10 -6 L-4 6 Z M-4 6 L2 -6 L8 6 Z M8 6 L14 -6 L20 6 Z M-18 9 H22"/>',
    "flame": '<path d="M0 -14 C7 -6 7 4 0 7 C-7 4 -8 -3 -3 -8 C-2 -3 1 -6 0 -14 Z M-10 11 H10"/>',
    "sun": '<circle r="6"/><path d="M0 -12 V-9 M0 9 V12 M-12 0 H-9 M9 0 H12 M-8.5 -8.5 L-6.5 -6.5 M6.5 6.5 L8.5 8.5 M-8.5 8.5 L-6.5 6.5 M6.5 -6.5 L8.5 -8.5"/>',
    "moon": '<path d="M4 -11 A11 11 0 1 0 11 5 A8 8 0 1 1 4 -11 Z"/>',
    "note": '<path d="M-3 7 A3.5 3 0 1 1 -3 6.9 Z M0.5 6 V-10 L9 -12 V3 M9 3 A3.5 3 0 1 1 9 2.9"/>',
    "cup": '<path d="M-9 -4 H6 V4 A6 6 0 0 1 0 10 H-3 A6 6 0 0 1 -9 4 Z M6 -1 H9 A3 3 0 0 1 9 5 H6 M-5 -12 C-3 -10 -6 -8 -4 -6 M0 -12 C2 -10 -1 -8 1 -6"/>',
    "bubble": '<path d="M-12 -9 H12 A3 3 0 0 1 15 -6 V4 A3 3 0 0 1 12 7 H-4 L-10 12 V7 H-12 A3 3 0 0 1 -15 4 V-6 A3 3 0 0 1 -12 -9 Z M-7 -1 H-6 M0 -1 H1 M7 -1 H8"/>',
    "star": '<path d="M0 -11 L3 -4 L11 -3 L5 2 L7 10 L0 6 L-7 10 L-5 2 L-11 -3 L-3 -4 Z"/>',
    "protea": '<path d="M0 8 C-8 4 -9 -4 -6 -10 C-4 -5 -2 -4 0 -12 C2 -4 4 -5 6 -10 C9 -4 8 4 0 8 Z M0 8 V15 M0 12 L-5 9"/>',
    "camera": '<path d="M-11 -5 H-5 L-3 -8 H3 L5 -5 H11 V8 H-11 Z"/><circle cy="1.5" r="4"/>',
    "ring": '<circle cy="3" r="7"/><path d="M-3 -4 L0 -9 L3 -4"/>',
    "spark": '<path d="M0 -8 V8 M-8 0 H8 M-5 -5 L5 5 M-5 5 L5 -5"/>',
    "smile": '<circle r="9"/><path d="M-4 2 C-2 5 2 5 4 2 M-3.5 -3 H-3 M3 -3 H3.5"/>',
}
names = list(D)
W = 360
cells = 6
step = W / cells
items = []
for r in range(cells):
    for c in range(cells):
        n = names[(r * 5 + c * 3) % len(names)]
        x = c * step + step / 2 + random.uniform(-9, 9) + (step / 2 if r % 2 else 0)
        y = r * step + step / 2 + random.uniform(-9, 9)
        x %= W
        rot = random.uniform(-25, 25)
        sc = random.uniform(0.95, 1.25)
        items.append(f'<g transform="translate({x:.1f} {y:.1f}) rotate({rot:.0f}) scale({sc:.2f})">{D[n]}</g>')
body = "".join(items)
for name, stroke in (("doodle-light.svg", "#0e5a52"), ("doodle-dark.svg", "#e9efe9")):
    op = ".11" if "light" in name else ".07"
    open(os.path.join(OUT, name), "w").write(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{W}" viewBox="0 0 {W} {W}"><g fill="none" stroke="{stroke}" stroke-opacity="{op}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{body}</g></svg>')
print("doodles written")
