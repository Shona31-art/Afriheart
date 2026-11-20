# Afriheart logo

A heart carrying a band of triangles inspired by Ndebele wall art: love, made in Africa.

| File | Use |
|---|---|
| `afriheart-wordmark.svg` / `.png` | Main logo on light backgrounds |
| `afriheart-wordmark-dark.svg` / `.png` | On teal or dark backgrounds |
| `afriheart-mark.svg` / `-1024.png` | The heart on its own (profile pictures, stickers, small spaces) |
| `afriheart-icon.svg` / `-1024.png` | App icon (rounded teal tile) |
| `afriheart-maskable.svg` | Android and web install icon (safe for any mask shape) |
| `afriheart-mono.svg` / `-1024.png` | One colour: embroidery, stamps, faxes, engraving |

**Colours**

| Name | Hex | Where |
|---|---|---|
| Teal | `#0e5a52` | The heart, app tile, buttons |
| Cream | `#f6f3ec` | Backgrounds, the heart on dark |
| Ochre | `#f2b134` | Band, "heart" on dark |
| Clay | `#d9573b` | Triangles, "heart" in the wordmark |
| Ink | `#0b2f2b` | "afri" in the wordmark, one-colour logo |

**Type:** the wordmark is Inter Display Bold (SIL Open Font License, free for logos), already turned
into outlines, so no font is needed to use the files.

**Keep it clear:** leave space around the logo at least the height of the band; don't stretch,
recolour or rotate it, or put the colour logo on busy photos (use the one-colour version instead).

To change and rebuild everything: `python3 make-logo.py` (needs `pip install fonttools`).

**Stickers and wallpaper.** `make-stickers.py` draws Afriheart's sticker pack (16 stickers with South
African phrases, text turned into outlines) into `server/public/stickers/`, and `make-doodles.py`
draws the chat wallpaper (`server/public/doodle-light.svg` and `doodle-dark.svg`). All original drawings.

**The app's look: "Malachite and gold".** Deep malachite green (#0e3b34), porcelain white
(#f2f3ef) with white cards, green-black text (#0f1f1b), and gold (#a9864f, champagne #d6b77e at
night) for fine details only: the current tab's marker, the frame around profile portraits, the
match screen and the sign-in opening. Dark mode is the evening look, with champagne gold buttons.
Type: **Bodoni Moda** (names, titles, big numbers; set heavier when small) and **Hanken Grotesk**
(everything else), both SIL Open Font License, shipped with the app (`@fontsource-variable`, loaded
in `server/src/app/layout.tsx`). Labels are sentence case, never shouty capitals.
