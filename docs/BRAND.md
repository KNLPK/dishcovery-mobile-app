# Brand artwork

The app icon, splash and welcome illustrations of the **demo** build. All of it
is a draft: replace any file with your own export (Figma or anything else)
under the same name and size, and no code changes are needed.

The artwork applies only to the demo variant (`APP_VARIANT=demo`, set by the
`demo` profile in `eas.json`), through `app.config.js`. The `preview` build
keeps `app.json` as it is, with the files in `assets/images/`.

## Files

Everything lives in `assets/brand/`. Each PNG has an SVG source with the same
name; the SVGs are the editable originals.

| File | Size (px) | Background | Used for |
| --- | --- | --- | --- |
| `icon.png` | 1024 × 1024 | opaque | The app icon where no mask is applied (older launchers, the store listing, iOS). |
| `adaptive-foreground.png` | 1024 × 1024 | transparent | Android adaptive icon, foreground layer. |
| `monochrome.png` | 1024 × 1024 | transparent | Android 13+ themed icons. Only the shape (alpha) is used; Android picks the colour. |
| `splash-icon.png` | 1024 × 1024 | transparent | Centred on the splash screen, drawn 200 dp wide. |
| `welcome-intro.png` | 1280 × 720 | transparent | Tutorial step 1, "Recipes, and a speed test": a recipe on a phone, and a speed gauge. |
| `welcome-formats.png` | 1280 × 720 | transparent | Tutorial step 2, "Three ways to send a recipe": a letter, the same letter packed, a form. |
| `welcome-test.png` | 1280 × 720 | transparent | Tutorial step 3, "The quick test". |
| `welcome-start.png` | 1280 × 720 | transparent | Tutorial step 4, the name and the two ways in. |

Colours set in `app.config.js`, not in the images:

| Setting | Value |
| --- | --- |
| Adaptive icon background colour | `#20515a` (brand teal) |
| Splash background colour | `#20515a` |
| Splash image width | 200 dp |

## Safe zones

- **Adaptive foreground and monochrome:** keep everything inside the central
  66% of the canvas, a circle of 676 px diameter (radius 338 px) centred at
  512, 512. Launchers crop the 1024 px layer to 72/108 of its size and then
  apply their own mask (circle, squircle, rounded square), and move the layer
  slightly for parallax. Anything outside the circle can be cut off. The draft
  mark's farthest point is about 290 px from the centre.
- **Icon (`icon.png`):** opaque, no transparency anywhere; the system rounds
  the corners itself. Keep the mark at least 120 px from each edge.
- **Splash (`splash-icon.png`):** transparent; the mark can fill most of the
  square because the 200 dp width is the whole image's width.
- **Tutorial illustrations:** 16:9, transparent, shown full width on a light
  teal card (`#eaf4f4`), so they need to read on that colour.

Make sure each mark still reads at 48 × 48 px, the size of an icon on a home
screen.

## Exporting and checking

```
node scripts/export-brand.mjs           # SVG → PNG for every file above, then check
node scripts/export-brand.mjs --check   # check only, e.g. after dropping in your own PNGs
```

The export renders each SVG with the installed Chrome or Edge, headless (set
`CHROME` to its path if it is not found). The check confirms each PNG's size and
that it is opaque or transparent as the table says, and prints PASS or FAIL.

If you export from Figma instead: export each frame as PNG at 1×, at the size
in the table, with the background turned off for the transparent files. Then
run the check.

## The draft mark

Three data bars rising from a bowl: a dish and a measurement in one shape.
Brand teal `#20515a`, bowl white, bars light teal `#abe1e5`. Every brand SVG
draws the same geometry: `icon.svg` at 1.25× because nothing masks it,
`splash-icon.svg` at 1.6×.

## The loader

`components/BrandLoader.tsx`, "the rising bowl", from the Claude Design
handoff (Brand motion v1). Built from plain Views, so there is no image file
to replace; change the constants at the top of the component instead.

- **Frame:** 96 units, everything scaled by size / 96. Sizes 24 (buttons), 48
  (lists and cards), 96 (full screen).
- **Layers, bottom to top:** steam (two 4 × 9 rects at 24, 20 and 68, 13),
  bar 1 JSON, bar 2 MessagePack, bar 3 Protocol Buffers (each 14 × 36 at
  y 16, x 19 / 41 / 63, scaled from its bottom edge at y 52), basin (half
  ellipse centre 48, 63, rx 34, ry 20, stroke 4), foot (20 × 6 at 38, 82),
  rim (76 × 7 at 10, 56, stroke 4). Bowl fill white.
- **Colours:** light ground: stroke, JSON bar and steam `#20515a`; on the
  brand teal (`tone="dark"`): stroke and steam white, JSON bar `#abe1e5`.
  MessagePack `#3c9b9f` and Protocol Buffers `#c1802b` on both.
- **Loop, 1600 ms,** easing `bezier(0.45, 0, 0.55, 1)` per segment:
  bar 1 0.25 → 0.55 by 400 ms; bar 2 holds to 200, 1.00 by 600; bar 3
  holds to 400, 0.74 by 800; all hold to 1150 and sink to 0.25 by 1450.
  Steam from 750 ms: opacity 0 → 0.55 at 1000 → 0 at 1250, rising 6 units.
  No steam below 48.
- **Reduced motion** (the system setting): bars held at 0.55 / 1.00 / 0.74,
  no steam, the whole mark's opacity 1 → 0.55 → 1 over 2400 ms.
- **Paused frame:** bars at 0.25, no steam, nothing running. Shown while the
  Quick test runs (the motion gate) and wherever a screen pauses it.
