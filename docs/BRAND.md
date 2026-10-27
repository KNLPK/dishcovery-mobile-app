# Brand artwork

The app icon, splash, launch intro and illustrations of the **demo** build. All of it
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
| `onboarding-1-recipes.png` | 312 × 200, and `@3x` 936 × 600 | transparent | Onboarding step 1, "Recipes, and a speed test": a recipe card on a phone, and a speed gauge. |
| `onboarding-2-formats.png` | 312 × 200, `@3x` | transparent | Onboarding step 2, "Three ways to send a recipe": a letter, the same letter packed tighter, a form. The heights and labels are the paper's mean sizes for the low tier (5.2 / 4.6 / 3.4 KB, −11% / −35%; `constants/paperResults.generated.ts`, pooled), and the screen says so under it. |
| `onboarding-3-quick-test.png` | 312 × 200, `@3x` | transparent | Onboarding step 3, "The quick test": a stopwatch and three groups of result bars. |
| `onboarding-4-start.png` | 312 × 200, `@3x` | transparent | Onboarding step 4: the mark, a name card, two buttons. |
| `cook-empty.png` | 160 × 120, `@3x` 480 × 360 | transparent | Cook, before any ingredient: the bowl with an egg, a tomato and a leaf. |
| `cook-no-match.png` | 160 × 120, `@3x` | transparent | Cook, when nothing matches: the bowl with low bars, and a crossed-out filter. |

The onboarding and Cook illustrations come from the Claude Design handoff
("Key screens redesign"). Each is exported at 1× and 3× (`name.png`,
`name@3x.png`); React Native picks the one for the phone's density.

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
- **Onboarding illustrations:** 312 × 200 dp, transparent, centred on a
  220 dp light teal card (`#eaf4f4`), so they need to read on that colour.
  The Cook illustrations sit on the screen's ground (`#f7f8f8`).

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

If you export from Figma instead: export each frame as PNG at 1× (and 3× as
`name@3x.png` where the table lists it), at the size in the table, with the
background turned off for the transparent files. Then run the check.

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

## The launch intro

`components/LaunchIntro.tsx`, from the Claude Design handoff ("Launch
intro"). It continues from the native splash: the JS layer mounts the same
frame (the mark at 200 dp, centred on `#20515a`), hides the native splash on
its first layout, then plays. Only the demo build plays it (`app.config.js`
sets `extra.brandIntro`), because only its splash is this frame. Flat Views,
transform and opacity only, native driver, through `startMotion()`.

| ms | Layer | Property | Easing |
| --- | --- | --- | --- |
| 0–120 | the splash frame | held, so the swap is invisible | |
| 120–420 | bar 1 (JSON, `#abe1e5`) | scaleY 1 → 1.15, from its base | out |
| 180–480 | bar 2 | scaleY 1 → 1.08; a `#3c9b9f` copy fades in over it | out |
| 240–540 | bar 3 | scaleY 1 → 1.12; a `#c1802b` copy fades in over it | out |
| 420–760 | the mark | translateY 0 → −36, scale 1 → 0.8 | out |
| 520–820 | "Dishcovery" (30/36 bold, white, 68 dp below the centre) | opacity 0 → 1, translateY 12 → 0 | out |
| 960–1080 | mark and wordmark | opacity 1 → 0 | in |
| 1000–1200 | the teal layer | translateY 0 → −(screen height) | in-out |
| 1040–1200 | the app underneath | opacity 0 → 1, translateY 12 → 0 | out |

**Reduced motion,** and while the setting is still unknown after 120 ms:
nothing moves. Bars keep the icon's heights and colour; the wordmark fades
in under the unmoved mark (150–450 ms, 110 dp below the centre); the intro
layer fades out (700–950, in-out) as the app fades in (750–950).

## Motion spec

Easings, as `Easing.bezier` (`ease` in `components/motion.tsx`; the loader's
brand curve lives in `BrandLoader`):

| Name | Curve | Used for |
| --- | --- | --- |
| out | 0.2, 0, 0, 1 | things arriving |
| in | 0.3, 0, 1, 1 | things leaving |
| in-out | 0.65, 0, 0.35, 1 | full-screen moves |
| brand | 0.45, 0, 0.55, 1 | the loader |
| pop | 0.34, 1.56, 0.64, 1 | overshoot (the heart, an added chip) |

**Onboarding** (`app/welcome.tsx`), times from the tap; Back mirrors them:

| ms | Layer | Property | Easing |
| --- | --- | --- | --- |
| 0–160 | illustration out | translateX 0 → −32, opacity → 0 | in |
| 0–120 | title and body out | translateX 0 → −16, opacity → 0 | in |
| 120–380 | illustration in | translateX +32 → 0, opacity 0 → 1 | out |
| 160–400 | title in | translateX +24 → 0, opacity 0 → 1 | out |
| 200–440 | body in | the same, 40 ms behind the title | out |
| 0–200 | previous dot's pill | scaleX 1 → 0.4, opacity → 0 | in |
| 120–360 | active dot's pill (20 × 8 in a fixed 20 dp slot) | scaleX 0.4 → 1, opacity 0 → 1 | out |
| 0–150, 150–300 | buttons, step 3 ↔ 4 | opacity out, then in | in / out |

Swiping: the illustration follows the finger at 0.6 × dx and the text at
0.4 × dx, fading as 1 − |dx| / 360; past 72 dp or 0.5 dp/ms it commits,
otherwise it settles back in 200 ms (out). Reduced motion: opacity only (out
120 ms, in 150 ms), and the dots swap at once. With the keyboard up on step
4, the illustration fades out and the text moves up into its place (200 ms,
out).

**Micro-interactions** (`components/motion.tsx`, `components/Sheet.tsx`),
times from the trigger. Each starts through `startMotion()`, so nothing moves
while the Quick test is measuring (it jumps to its end instead), and each has
a reduced version.

| Name | Where | What moves | Easing | Reduced motion |
| --- | --- | --- | --- | --- |
| Page | every pushed screen (`Screen` → `PageEnter`) | the stack fades the screen in and out; the content slides 24 dp → 0 over 240 ms | out | the fade only |
| Sheet | every `Sheet` | open: rises by its own height and fades in, 280 ms, backdrop in 200 ms; close: both out in 200 ms, then the Modal goes | out / in | fades only |
| List | result cards on Cook and Search (`StaggerItem`) | opacity 0 → 1, 8 dp → 0, 200 ms, 40 ms apart, first 6 cards; later ones at once | out | opacity only |
| Chip | Cook's ingredient chips (`Pop`) | added: opacity 0 → 1, scale 0.8 → 1, 180 ms; removed: back out in 150 ms, then the list reflows | pop / in | opacity only |
| Heart | save on Cook and Home cards (`HeartButton`) | haptic tick; filled heart fades in over 80 ms; the button scales 1 → 1.3 (120 ms, out) → 1 (140 ms, pop). Unsave: the fill fades out, 150 ms | out, pop | the fades only |
| Bars | Results charts, the format sheet (`GrowBar`) | scaleX 0 → 1 from the left, 300 ms, 60 ms apart; on Results the values fade in after the last bar, 150 ms | out | the bars fade in |
| Button | every `PressableScale` (buttons, cards, chips) | held: scale 0.97, opacity 0.85, 150 ms in and out | out | opacity only |
| Header pill | the format pill's value (`CrossfadeText`) | a new measurement: old text out 150 ms, new text in 150 ms | in / out | the same (opacity only) |

Two departures from the handoff, both forced by the platform: the page
transition's outgoing screen does not drift −24 dp (the native stack cannot
move the screen underneath; it fades instead), and a removed result card
does not fade out on its own (the list is replaced by the loading state when
the search changes, so there is nothing left to fade).
