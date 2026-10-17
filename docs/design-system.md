# QuestLearn design system

QuestLearn's interface follows Apple's design approach, translated to the web: system typography, semantic colours that adapt to light and dark, a translucent nav bar, critically damped springs, instant press feedback, and motion that enters and leaves along the same path. The source rules are in the apple-design skill (`~/.agents/skills/apple-design/SKILL.md`).

## Principle: minimal, not decorated

The interface should look made by a person with taste, not assembled from a template. In practice:

- **One accent, and it is the ink.** Primary buttons, selection and progress are black on white (white on black in dark mode). Colour appears only where it means something: green = right, red = wrong, amber = caution.
- **Hierarchy from type and space, not boxes.** Prefer a hairline (`border-line`) or plain spacing over a card. Cards, where used, are a 1px hairline with no shadow.
- **No decoration.** No icon tiles, sparkle icons, emoji, gradient logos, glow shadows, or "AI" badges. An icon appears only when it is the clearest label (pause, close, chevron).
- **No pills for metadata.** Subject, difficulty and origin are plain grey text joined with " · ". `Badge` renders as small text, coloured only for meaning.
- **Sentence case everywhere**, including buttons ("Start quest", not "Start Quest"). Section labels (`t-eyebrow`) are small and quiet, never uppercase.
- **Short, plain copy.** One sentence where three were used; no em-dash asides; no "Welcome, Explorer".
- **Honesty is kept:** content origin is still always shown (`OriginBadge`: "Sample", "Generated from a template", "AI-written, checked"), just quietly.

## Color

All colours are semantic tokens in `src/app/globals.css` and switch with `prefers-color-scheme`. Never hard-code a hex value in UI chrome.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` / `--surface` | `#ffffff` | `#0a0a0a` / `#111111` | page, cards |
| `--surface-2` | `#f5f5f5` | `#1a1a1a` | wells: equations, notes |
| `--text` | `#111111` | `#f2f2f2` | primary text |
| `--muted` / `--faint` | `#5c5c5c` / `#737373` | `#a3a3a3` / `#858585` | secondary / non-essential text |
| `--line` / `--line-strong` | black 9% / `#d4d4d4` | white 10% / `#2e2e2e` | hairlines |
| `--tint` / `--on-tint` | `#111111` / `#ffffff` | `#f2f2f2` / `#0a0a0a` | the accent (ink) |
| `--green(-fill)` `--red(-fill)` `--orange(-fill)` | meaning colours | lifted for dark | right / wrong / caution |

Sheets and dialogs (`material-thick`) are solid; only the nav bar is translucent.

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
| `t-eyebrow` | small sentence-case section labels |

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
