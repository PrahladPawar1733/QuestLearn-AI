# QuestLearn design system

QuestLearn's interface follows Apple's design approach, translated to the web: system typography, semantic colors that adapt to light and dark, translucent materials for floating chrome, critically damped springs, instant press feedback, and motion that enters and leaves along the same path. The source rules are in the apple-design skill (`~/.agents/skills/apple-design/SKILL.md`).

## Color: "Woad & Paper"

All colors are semantic and switch with `prefers-color-scheme`. Defined in `src/app/globals.css`. Never hard-code a hex value in UI chrome.

The palette is **natural, not synthetic**: earth pigments and daylight rather than iOS system colors. No pure `#fff`, no pure `#000`, no neon.

### Neutral temperature: warm, in both modes

Every neutral sits on one low-chroma **warm** axis (hue ~35-45 deg). Light mode is limestone paper and bark ink; dark mode is damp bark and parchment. The cast is deliberate and consistent - a warm ground makes the cool woad accent read as the only "cold" thing on screen, which is exactly the hierarchy we want, and it keeps long reading sessions from feeling clinical. Neutral *fills* are a warm stone overlay (`rgb(118 104 82 / a)` light, `rgb(158 146 124 / a)` dark), not grey.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#f3efe6` limestone | `#15120e` deep bark | page / grouped background |
| `--surface` | `#fdfbf6` page white | `#1f1b16` raised bark | cards |
| `--surface-2` | `#efe9dd` oat | `#2a251e` | wells inside cards |
| `--surface-3` | `#e2dacb` sand | `#39332a` | tracks, grabbers, inactive rails |
| `--text` | `#211d17` bark ink | `#f4efe4` parchment | primary text |
| `--muted` | `#5b5346` driftwood | `#b9ae9b` ash | secondary text |
| `--faint` | `#7e7566` stone | `#8d8371` smoke | non-essential text only |
| `--line` / `--line-strong` | warm 20% / `#cdc4b1` | warm 32% / `#3d372d` | hairlines |
| `--fill` .. `--fill-4` | warm stone 20/16/12/8% | warm stone 30/26/20/14% | grey buttons, tracks, hovers |

### The accent: woad

**`--tint` is woad** - the blue of the indigo dye plant: `#3c4f85` in light, lifted to `#a9b7e8` in dark.

Why woad, and why only woad:

- It is a **real pigment**, the oldest blue dye in Europe, so it carries the "natural" brief honestly rather than decoratively. It reads deep denim / ink-on-paper: modern and credible to a 14-18 year old, the register of good stationery and a well-made app, not a primary-colour kids' product and not corporate navy (it is noticeably more violet and less saturated than a corporate blue).
- It is the **only** candidate that collides with nothing semantic. A forest-green accent competes with success; clay, terracotta and ochre compete with danger and warning. Woad leaves green / red / honey free to mean exactly one thing each.
- It keeps the app's existing identity. The old accent was iOS indigo `#5856d6`; woad is the same hue family with the plastic glow taken out, so every one of the ~100 `--tint` call sites still reads the way its author intended.

**The accent inverts polarity in the dark.** Light mode: deep woad chip, warm-white `--on-tint`. Dark mode: light woad chip, bark-ink `--on-tint`. This is the Material 3 primary/on-primary pattern, and it is the only arrangement where `text-tint` (58 call sites) *and* `text-on-tint` on `bg-tint` both clear 4.5:1 - a mid-tone accent can satisfy one or the other, never both.

### Earth pigments

Two families, and the distinction is load-bearing:

- **Text colors** - `--green`, `--red`, `--orange`, `--cyan` - flip polarity between modes (deep pigment on paper, light pigment on bark). Use them for text and icons on a background, never as a fill behind white.
- **Fill colors** - `--green-fill`, `--red-fill`, `--orange-fill`, `--blue`, `--teal`, `--purple`, `--pink` - stay mid-deep in **both** modes, because call sites put hard-coded `text-white` on them. Every fill clears 4.5:1 with white and 3:1 against the page.

| Token | Light | Dark | Pigment | Use |
|---|---|---|---|---|
| `--green` | `#3b6614` | `#a8d47c` | leaf | success text / icons |
| `--green-fill` | `#4a7f28` | `#468328` | moss | success fills, rings, bars |
| `--red` | `#742010` | `#e18262` | iron oxide | error text / icons |
| `--red-fill` | `#8a2c1a` | `#ab3d27` | rust | error fills, rings, bars |
| `--orange` | `#7f4310` | `#e0aa4e` | burnt ochre | warning / hint / achievement text |
| `--orange-fill` | `#a9661a` | `#a66519` | honey | warning fills, streak chips |
| `--cyan` | `#0c5e70` | `#6ec3d0` | glacier water | secondary text accent, "medium" difficulty |
| `--blue` | `#1f6a93` | `#2a7aa6` | open sky | illustration / category fill |
| `--teal` | `#1a6f66` | `#227f6f` | deep pool | illustration / category fill, diagram strokes |
| `--purple` | `#6b4a85` | `#8059a0` | iris | illustration / category fill |
| `--pink` | `#a94a63` | `#b55570` | foxglove | illustration / category fill |
| `--yellow` | `#c9941a` | `#e8c45a` | pollen ochre | decorative only - **never** text, never an essential shape |
| `--chart-2` | `#b0623a` | `#cf8552` | terracotta | chart series 2 (pairs with woad as a blue/orange split) |

Rules of use:

- Tinted backgrounds are the **fill** token at 8-22% (`bg-success-fill/16`, `bg-tint/14`) carrying the matching **text** token. Verified at 4.5:1 for every combination in use, over both `--surface` and `--surface-2`.
- A solid fill (`bg-success-fill`, `bg-amber-fill`, `bg-teal`, ...) always carries white.
- `--yellow` is decorative. A yellow light enough to still read as yellow cannot reach 3:1 on paper; if you need "warning", use `--orange` / `--orange-fill`.
- One accent per screen. Color never carries meaning alone - always with a label or an icon.

### Measured contrast

Computed from `src/app/globals.css` with alpha composited over the real backdrop (sRGB relative luminance, WCAG 2.x). Targets: body text AAA 7:1, secondary 4.5:1, tertiary 3:1, any text on a tinted fill 4.5:1.

| Pair | Light | Dark | Target |
|---|---|---|---|
| `--text` on `--bg` | **14.6** | **16.3** | 7 |
| `--text` on `--surface` | **16.2** | **14.9** | 7 |
| `--text` on `--surface-2` | **13.9** | **13.3** | 7 |
| `--text` on `--surface-3` | **12.1** | **10.9** | 7 |
| `--text` on `.material-thick` | **16.0** | **15.1** | 7 |
| `--muted` on `--bg` | **6.6** | **8.5** | 4.5 |
| `--muted` on `--surface` | **7.3** | **7.8** | 4.5 |
| `--muted` on `--surface-2` | **6.3** | **6.9** | 4.5 |
| `--muted` on `--surface-3` | **5.5** | **5.7** | 4.5 |
| `--faint` on `--bg` | **4.0** | **5.0** | 3 |
| `--faint` on `--surface` | **4.4** | **4.6** | 3 |
| `--faint` on `--surface-2` | **3.8** | **4.1** | 3 |
| `--faint` on `--surface-3` | **3.3** | **3.3** | 3 |
| `--tint` on `--bg` | **6.9** | **9.5** | 4.5 |
| `--tint` on `--surface` | **7.7** | **8.7** | 4.5 |
| `--tint` on `--surface-2` | **6.6** | **7.7** | 4.5 |
| `--on-tint` on `--tint` | **7.7** | **9.4** | 4.5 |
| `--on-tint` on `--tint-pressed` | **10.0** | **7.1** | 4.5 |
| `--green` on `--surface` / `--surface-2` | **6.6 / 5.6** | **10.1 / 9.0** | 4.5 |
| `--red` on `--surface` / `--surface-2` | **10.4 / 8.9** | **6.2 / 5.5** | 4.5 |
| `--orange` on `--surface` / `--surface-2` | **7.5 / 6.4** | **8.2 / 7.3** | 4.5 |
| `--cyan` on `--surface` / `--surface-2` | **7.1 / 6.1** | **8.5 / 7.5** | 4.5 |
| `--green` on `success-fill/16` over `--surface` / `--surface-2` | **5.4 / 4.7** | **8.5 / 7.6** | 4.5 |
| `--red` on `danger-fill/14` over `--surface` / `--surface-2` | **8.2 / 7.1** | **5.6 / 5.0** | 4.5 |
| `--orange` on `amber-fill/22` over `--surface` / `--surface-2` | **5.7 / 5.0** | **6.4 / 5.7** | 4.5 |
| `--cyan` on `cyan/14` over `--surface` / `--surface-2` | **5.7 / 5.0** | **6.5 / 5.7** | 4.5 |
| `--tint` on `tint/20` over `--surface` / `--surface-2` | **5.6 / 4.9** | **5.7 / 5.0** | 4.5 |
| white on `--green-fill` | **4.8** | **4.6** | 4.5 |
| white on `--red-fill` | **8.6** | **6.1** | 4.5 |
| white on `--orange-fill` | **4.6** | **4.7** | 4.5 |
| white on `--blue` | **5.9** | **4.7** | 4.5 |
| white on `--teal` | **6.0** | **4.9** | 4.5 |
| white on `--purple` | **7.1** | **5.5** | 4.5 |
| white on `--pink` | **5.5** | **4.7** | 4.5 |
| `--green-fill` vs `--bg` (shape) | **4.2** | **4.0** | 3 |
| `--red-fill` vs `--bg` (shape) | **7.5** | **3.1** | 3 |
| `--orange-fill` vs `--bg` (shape) | **4.0** | **4.0** | 3 |
| `--blue` / `--teal` / `--purple` / `--pink` vs `--bg` | **5.2 / 5.2 / 6.2 / 4.8** | **3.9 / 3.9 / 3.4 / 4.0** | 3 |
| `--chart-2` vs `--surface` | **4.4** | **5.8** | 3 |
| `--chart-2` vs `--tint` (series split) | **1.8** | **1.5** | - |

### Success vs error under colour-vision deficiency

Success and error are separated by **lightness as well as hue**, so they survive protanopia and deuteranopia. Simulated with Vienot/Brettel/Mollon 1999 and measured as a contrast ratio between the two simulated colors:

| Pair | normal | protan | deutan | tritan |
|---|---|---|---|---|
| light `--green` vs `--red` | 1.58 | 2.04 | **1.40** | 1.11 |
| light `--green-fill` vs `--red-fill` | 1.77 | 2.38 | **1.54** | 1.20 |
| dark `--green` vs `--red` | 1.63 | 2.02 | **1.48** | 1.22 |
| dark `--green-fill` vs `--red-fill` | 1.32 | 1.85 | **1.13** | 1.16 |

The dark *fill* pair is the weak case (1.13 under deuteranopia) and it is a hard ceiling, not an oversight: both fills must clear 4.5:1 with white (luminance <= 0.183) and 3:1 against the page (luminance >= 0.12), which leaves a 1.33x lightness window. Any pair outside it either loses white-text legibility or stops reading as a chip. So in dark mode the fills carry **hue**, and the signal is carried by the text tokens (1.48) plus the mandatory icon. This is why "colour never alone" is a rule and not a preference: every correct/wrong state in `feedback-panel`, `option-list` and `checkpoint-card` must keep its check/cross icon or its label.

### Hard-coded colors still to migrate

These predate the retune and now clash with the palette. Listed for the owners of those files:

| File:line | Hard-coded | Replace with |
|---|---|---|
| `src/components/games/car-rush/hud.tsx:81` | `from-[#7d7aff] to-[#40cbe0]` | `from-tint to-teal` |
| `hud.tsx:122` | `ring-[#7d7aff]/60`, `ring-[#30d158]/50` | `ring-tint/60`, `ring-success-fill/60` |
| `hud.tsx:125` | `text-[#9b99ff]`, `text-[#30d158]` | `text-tint`, `text-success` |
| `hud.tsx:151` | `bg-[#ff453a]`, `bg-[#ff9f0a]` | `bg-danger-fill`, `bg-amber-fill` |
| `hud.tsx:218` | `#ff453a` / `#40cbe0` / `#7d7aff` (RPM arc) | `var(--red-fill)` / `var(--teal)` / `var(--tint)` |
| `hud.tsx:210`, `:236` | `rgba(255,69,58,...)` (redline) | `color-mix(in srgb, var(--red-fill) 55%, transparent)` |
| `hud.tsx:248`, `:274-276` | `#9fe4ff`, `#40cbe0` (nitro arc, pips) | `var(--cyan)`, `var(--teal)` |
| `hud.tsx:48` | `rgba(6,8,18,0.5/0.82)` speed vignette | warm bark: `rgba(16,12,8,0.5/0.82)` |
| `hud.tsx:199`, `:296` | `rgba(0,0,0,0.45)`, `rgba(12,14,24,0.6)`, `rgba(0,0,0,0.35)` | `rgba(16,12,8,...)` / `var(--scrim)` for the panel glass |
| `hud.tsx:201-205`, `:244` | `rgba(255,255,255,0.1-0.14)` | `var(--highlight-edge)` or `rgb(246 238 222 / a)` |
| `checkpoint-card.tsx:61` | `bg-[rgba(4,6,14,0.72)]` scrim | `bg-[rgba(10,7,4,0.72)]` or `var(--scrim)` |
| `checkpoint-card.tsx:73` | `shadow-[...rgba(0,0,0,0.5)]` | `var(--shadow-float)` |
| `touch-controls.tsx:187-190` | `#30d158`, `#ff453a`, `#40cbe0`, `#ff9f0a`, `#06202a`, `#2a1800` + light companions | `var(--green-fill)`, `var(--red-fill)`, `var(--teal)`, `var(--orange-fill)`, warm bark darks |
| `src/components/brand/logo.tsx:10-11`, `src/app/icon.svg` | `#7d7aff`, `#5856d6` | woad: `#a9b7e8`, `#3c4f85` |
| `src/app/layout.tsx:16-17` | `theme-color` `#f2f2f7` / `#000000` | `#f3efe6` / `#15120e` |
| `src/components/progress/charts.tsx:9-11` | `#ffffff`, `#5856d6`, `#1c1c1e`, `#7d7aff` | `var(--surface)`, `var(--tint)` (or the `--chart-2` pair) |
| `src/components/viz/collision-diagram.tsx:127-132` | `#b9b8ff`/`#5856d6`, `#b5f0fb`/`#1a9fbd` gradients | woad and deep-pool ramps off `var(--tint)` / `var(--teal)` |

Two accessibility fixes that only the call sites can make:

- `create-flow.tsx:386`, `:695`, `:697` use `text-on-tint` on `bg-success-fill` / `bg-danger-fill`. In dark mode `--on-tint` is bark ink (it has to be, to sit on the light woad chip), so on a deep fill it measures 4.0:1 and 3.0:1. Change those three to `text-white`, which measures 4.6:1 and 6.1:1.
- `collision-diagram.tsx:177` uses `text-teal` as body text. `--teal` is a *fill* token (3.5:1 as dark-mode text). Use `text-cyan` there.

## Typography

System font everywhere (SF Pro on Apple devices). Use the text-style utilities; they set size, leading and size-specific tracking together.

| Utility | Use |
|---|---|
| `t-display` | landing hero only |
| `t-large-title` | page titles |
| `t-title1`, `t-title2` | section and hero headings |
| `t-title3` | card titles, question text |
| `t-headline` | emphasized row titles |
| `t-body` | paragraphs |
| `t-callout`, `t-subhead` | dense UI text, list rows |
| `t-footnote`, `t-caption` | metadata |
| `t-eyebrow` | small uppercase section labels |

Numbers in game UI (XP, scores, streaks, stats) use `font-rounded tabular` (SF Pro Rounded via `ui-rounded`). Build hierarchy with weight + size + leading together; emphasize with weight, not with color.

## Components

- `Button` (`src/components/ui/button.tsx`). Variants: `primary` (filled tint, one per screen), `success` (filled green), `tinted`, `secondary` (gray), `ghost` (plain tint text), `plain`, `danger`, `amber`. Sizes: `sm` (capsule), `md`, `lg` (50px), `icon` (circle). All use `.pressable`.
- `.pressable`: instant scale-to-0.97 on pointer-down. Put it on any custom tappable element.
- `Card`, `CardHeader`, `CardTitle`, `CardContent`, `SectionHeader`: grouped cards, radius 20px, no borders.
- `Badge` tones: neutral, primary, cyan, success, danger, amber.
- `Progress` with `tone` (`tint`, `success`, `amber`, `danger`) and `masteryTone(m)`. Solid tracks, no gradients.
- `BottomSheet` (`src/components/ui/sheet.tsx`): draggable detent sheet for phones.
- Materials: `.material-chrome` for floating bars, `.material-thick` for sheets, dialogs and toasts. Never stack one translucent surface on another.

## Motion

- Every Motion animation defaults to a critically damped spring (`MotionConfig` in `src/components/providers.tsx`). Presets in `src/lib/motion.ts`: `spring.default`, `spring.snappy`, `spring.gentle`, and `spring.momentum` only after a flick or drag release.
- No bouncy overshoot on things that simply appear. No `stiffness/damping` values that overshoot.
- Enter and exit along the same path (a panel that rises from below leaves downward). Popovers and dialogs grow from their trigger.
- Glass surfaces "materialize" (`materialize` preset: opacity + scale + blur together).
- Reduced motion: replace movement with a short cross-fade (`fade` preset). Decorative loops stop.
- Only animate `transform`, `opacity` and `filter`.

## Layout

- Page title with `t-large-title`, content in grouped cards on `bg-bg`, generous spacing (`space-y-6` to `space-y-8` between groups).
- Wayfinding: every screen says where you are and how to get back. Specific nav labels (Dashboard, Progress, New Quest).
- Phone first for gameplay; desktop for presentation. No horizontal page scroll at 360px.
