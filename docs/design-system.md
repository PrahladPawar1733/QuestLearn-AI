# QuestLearn design system

QuestLearn's interface follows Apple's design approach, translated to the web: system typography, semantic colours that adapt to light and dark, a translucent nav bar, critically damped springs, instant press feedback, and motion that enters and leaves along the same path. The source rules are in the apple-design skill (`~/.agents/skills/apple-design/SKILL.md`).

## Principle: bright & playful, always light

A modern learning app: light and friendly, with one confident brand colour and real depth.

- **Always light.** No dark theme; `color-scheme: light`.
- **Brand = violet → blue.** `--tint` (#5b45f0) with `--tint-2` (#3b82f6). Primary buttons, progress and hero accents use the `.bg-brand` gradient; key words can use `.text-brand`.
- **Cards have depth.** `.surface` is white with a soft shadow and faint edge (in `@layer components`, so ring/shadow utilities can override it for selected and hover states). Generous radii (20-24px).
- **Tinted chips are back, gently.** `Badge` tones are soft tinted pills; colour always comes with a label. Meaning colours stay: green right, red wrong, amber caution.
- **Hero areas glow.** `.hero-glow` puts soft violet/blue radial light behind landing content.
- **Still no clutter:** sentence case, short copy, no sparkle icons on buttons, no icon tile on every item.

## Color

| Token | Value | Role |
|---|---|---|
| `--bg` | `#f6f6fb` | soft lilac-grey canvas |
| `--surface` / `--surface-2` | `#ffffff` / `#f2f1fa` | cards / wells |
| `--text` / `--muted` / `--faint` | `#17152b` / `#5a5873` / `#75738c` | text |
| `--tint` / `--tint-2` | `#5b45f0` / `#3b82f6` | brand gradient |
| `--green` `--red` `--orange` (+ `-fill`) | | right / wrong / caution |

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
| `t-eyebrow` | small sentence-case section labels (often in brand colour) |

One typeface: headings are semibold (600), never bold-black. Numbers use `tabular` figures (`font-rounded` now maps to the system font). Build hierarchy with weight + size + leading together; emphasize with weight, not with color.

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
