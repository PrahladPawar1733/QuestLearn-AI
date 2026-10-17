# QuestLearn design system

QuestLearn's interface follows Apple's design approach, translated to the web: system typography, semantic colors that adapt to light and dark, translucent materials for floating chrome, critically damped springs, instant press feedback, and motion that enters and leaves along the same path. The source rules are in the apple-design skill (`~/.agents/skills/apple-design/SKILL.md`).

## Color tokens

All colors are semantic and switch with `prefers-color-scheme`. Defined in `src/app/globals.css`. Never hard-code hex values in UI chrome.

| Purpose | Tailwind class | Notes |
|---|---|---|
| Page background | `bg-bg` | systemGroupedBackground (#F2F2F7 / #000) |
| Card | `bg-surface` or `.surface` | white / #1C1C1E, no border; `.surface` adds the light-mode soft shadow |
| Well inside a card | `bg-surface-2` | figures, option rows, stat tiles inside cards |
| Primary text | `text-ink` | label |
| Secondary text | `text-muted` | secondaryLabel |
| Tertiary text | `text-faint` | non-essential only (hints, captions) |
| Hairline | `border-line` / `bg-line` | use sparingly; prefer spacing and background contrast |
| Neutral fills | `bg-fill`, `bg-fill-2`, `bg-fill-3`, `bg-fill-4` | grabbers, gray buttons, tracks, hover states |
| App tint (indigo) | `text-tint`, `bg-tint`, `bg-tint/14` | the one accent color; `text-on-tint` on filled tint |
| Success | `text-success` (text), `bg-success-fill` (fills) | |
| Error | `text-danger`, `bg-danger-fill` | |
| Warning / hint / achievement | `text-amber`, `bg-amber-fill` | system orange |
| Extras | `text-teal`, `bg-teal`, `text-cyan`, `text-purple`, `text-pink`, `bg-yellow` | illustration and secondary series |

Tinted backgrounds use the fill color at 10–16% (`bg-success-fill/12`, `bg-tint/14`) with the matching text color. Color always comes with a label or icon, never alone.

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
