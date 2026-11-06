# Design System

Visual language for every surface we ship: landing page, connect screen, buy page, wallet, company dashboard, reserves page, app directory, and the demo apps' credit widgets.

The theme follows whitechain.io: white paper surfaces framed by hairlines, one electric blue, deep navy ink, a lime accent for terminals and callouts, and animated fields of tiny plus glyphs and leaf-shaped dither dots. Everything below is measured from the live site so it can be rebuilt exactly.

Stack assumption: Tailwind v4 with the `@theme` block at the end of this file. Canvas effects are plain TypeScript, no library.

---

## 1. Principles

1. **Paper and ink.** White surfaces, near-black navy text, 1px borders. No gray card backgrounds, no drop shadows on cards, no gradients on text.
2. **One blue.** `#0066FF` is the only call to action color. Everything else is neutral.
3. **Hairline grids, not cards.** Tiles sit edge to edge in a grid with 1px gaps. The gap color is the border. Tiles have no radius.
4. **Dots are the texture.** Motion comes from canvas dot fields, never from moving layout. Dots are quiet (opacity 0.03 to 0.22) and only brighten near a focus point, near the pointer, or where an image tells them to.
5. **Short sentences that end with a period.** Headlines read like statements, not slogans.
6. **Respect reduced motion.** Every animation has a static fallback.

---

## 2. Color

### 2.1 Tokens

| Token | Hex | Use |
|---|---|---|
| `wc-blue` | `#0066FF` | Primary buttons, links, highlights, selection |
| `wc-blue-2` | `#3385FF` | Button hover, dark surface accents |
| `wc-navy` | `#080A28` | Logo mark, primary dark button, strong text |
| `wc-ink` / `wc-text-1` | `#07081E` | Body headings and paragraphs |
| `wc-ink-2` | `#000A47` | Stat numbers in the glass panel |
| `wc-ink-3` | `#001078` | Reserved deep accent |
| `wc-text-2` | `#4A5567` | Secondary paragraph text |
| `wc-text-muted` | `#45464D` | Nav links, eyebrow labels, descriptions |
| `wc-icon-muted` | `#6A6A72` | Icons at rest, disclaimers |
| `wc-mute` | `#97A2B6` | Placeholder level grays |
| `wc-navy-mute` | `#5A6B93` | Terminal comments and labels |
| `wc-surface` | `#FFFFFF` | Page and tile background |
| `wc-bg` | `#F8FAF9` | Hover background for link tiles, header fill |
| `wc-surface-2` | `#E3E8EF` | Frame border, secondary button, skeletons |
| `wc-neutral-80` | `#F5F5F5` | Chip background, inset panels |
| `wc-neutral-30` | `#D2D3D8` | Disabled strokes |
| `wc-neutral-20` | `#5E6073` | Disabled text |
| `wc-neutral-15` | `#323346` | Dark button hover |
| `wc-border` | `#C7D0DC` | Outline buttons, inputs |
| `wc-border-light` | `#E6E6EC` | Hairline grid gaps and section dividers |
| `wc-dither-1` | `#DFE5EC` | Lightest dither dot, hero radial wash |
| `wc-lime` | `#DCF218` | Terminal prompt, cursor, accent button |
| `wc-lime-2` | `#E6F84A` | Accent hover |
| `wc-lime-3` | `#C8DD15` | Accent active |
| `wc-mint` | `#68ECBC` | Success states |
| `wc-mint-2` | `#60E9B1` | Success hover |
| `wc-mint-pastel` | `#A4F4D7` | Text on dark primary hover |
| `wc-error` | `#E24137` | Errors |
| `wc-warning` | `#ED7536` | Warnings |

### 2.2 Dark surfaces

Used for the closing CTA band, the footer, and the terminal.

| Token | Hex | Use |
|---|---|---|
| `wc-bg-dark` | `#000722` | Dark page background, input wells |
| `wc-surface-dark` | `#000933` | Dark section and terminal fill |
| `wc-border-dark` | `#1E3D80` | Dark borders, terminal chrome dots |
| `wc-border-dark-muted` | `#122A5E` | Dark hairlines |
| `wc-text-dark-1` | `#FFFFFF` | Dark headings |
| `wc-text-dark-2` | `#9FB2CC` | Dark body and links |
| `wc-text-dark-3` | `#6A7F9C` | Dark labels, placeholder |
| `wc-selection-dark` | `#001A4D` | Selection on dark |

### 2.3 Canvas palettes

The dot renderers take their own hex lists.

| Name | Values | Where |
|---|---|---|
| Dither ramp (light) | `#DFE5EC`, `#5C82FF`, `#0044FF`, `#DCF218` | Hero dither field, level 1 to 4 |
| Dither ramp (dark) | `#122A5E`, `#3385FF`, `#0044FF`, `#DCF218` | Footer field, inverted |
| Leaflet ramp | `#9EC2FF`, `#5C82FF`, `#2F5EFF`, `#0044FF` | Image dot fields, level 1 to 4 |
| Twinkle ink (light) | `#030712` | Plus grid on white |
| Twinkle ink (dark) | `#6A7F9C` | Plus grid on navy CTA |
| Footer ink | `#9FB2CC` | Plus grid behind the footer glyph |
| Cross hatch ink | `rgba(8,10,40,a)` | Section header hatch |

Note the canvas blue is `#0044FF`, slightly deeper than the UI blue `#0066FF`. Keep both. Dots read darker than buttons on purpose.

### 2.4 Selection and focus

```css
::selection { background: #3385FF; color: #FFFFFF; }
:focus-visible { box-shadow: 0 0 0 2px rgba(0,102,255,0.4); outline: none; }
```

---

## 3. Typography

### 3.1 Families

| Role | Stack | Source |
|---|---|---|
| Display and body | `"Onest", system-ui, sans-serif` | Google Fonts, weights 300, 400, 500, 600 |
| Mono | `"JetBrains Mono", ui-monospace, monospace` | Google Fonts, weight 400 |

One family does everything. Weight 600 for headings, 500 for labels and buttons, 400 for body, 300 for large stat numbers.

### 3.2 Scale

| Name | Size | Line height | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `type-hero` | `clamp(2.5rem, 2.28rem + 0.9vw, 3rem)` | 1.06 | 600 | -0.02em | Page H1 |
| `type-section` | 1.75rem, from 768px `clamp(2rem, 1.25rem + 1.5625vw, 2.5rem)` | 1.3 | 600 | 0 | Section H2 |
| `heading-4xl` | 72px | 80px | 500 | 0 | Reserved |
| `heading-3xl` | 48px | 56px | 500 | 0 | Big numbers |
| `heading-2xl` | 32px | 40px | 500 | 0 | Highlight line |
| `heading-xl` | 24px | 32px | 500 | 0 | Sub headings |
| `heading-lg` | 18px | 26px | 500 | 0 | Tile titles |
| `heading-md` | 16px | 24px | 500 | 0 | Small titles |
| `body` | 16px | 1.5 | 400 | 0 | Default |
| `lead` | 18px | 1.625 | 400 | 0 | Hero paragraph |
| `description` | 17px | 1.625 | 400 | 0 | Section intro under H2 |
| `tile-text` | 16px | 26px | 400 | 0 | Tile body |
| `small` | 15px | 22.5px | 400 or 500 | 0 | Stat labels, tile subtitles |
| `label` | 13px | 19.5px | 500 | 0 | Eyebrow, terminal chrome |
| `label-upper` | 13px | 19.5px | 500 | 0.08em | Uppercase group labels |
| `caption` | 12px | 1.6 | 400 | 0 | Disclaimers |
| `mono` | 13px | 1.7 | 400 | 0 | Terminal body |
| `mono-ascii` | 10px | 1.05 | 400 | 0.06em | ASCII art block |

### 3.3 Specific headline treatments

- Hero H1: `type-hero`, `text-wc-text-1`, `text-balance`, `tracking-[-0.02em]`.
- Section H2: `type-section font-semibold text-black`, max width 42rem (`max-w-2xl`).
- Two-tone H2 (the "Everyone talks about going onchain" pattern): line one 20px/30px black, line two 32px/1.15 `text-wc-blue` with `tracking-[-0.01em]`, 24px gap between them. From 640px: 24px/36px and 40px/52px.
- Dark CTA H2: 40px, from 640px 56px, line height 1.06, white.
- Stat number: 40px, from 640px 48px, weight 300, line height 1, black. Label under it 15px/22.5px weight 500.
- Numbered step box: 64px square, 1px `wc-border-light`, number 13px weight 500, boxes overlap by 1px (`-mt-px`).
- Eyebrow above an H2: 13px/19.5px weight 500 `wc-text-muted`, inside a 24px tall row, 20px gap to the H2.

### 3.4 Copy voice

- Headlines are complete sentences with a period. "Next Step Onchain." "A Layer 2 built for real usage." "Your next step is one click away."
- Sentence case everywhere. No all caps except the 0.08em group labels.
- Three-beat lines are fine: "Cheaper. Faster. Simpler."
- Numbers are written as figures with a unit: "40M+", "<$0.01", "1875".
- Buttons are verbs: "Start building", "Become a partner", "Explore WBT", "Talk to sales".
- Tile subtitles are short fragments with an ampersand: "Guides & RPC reference", "Programs & support".

For this product:

| Slot | Copy |
|---|---|
| Hero H1 | One balance. Every AI app. |
| Hero lead | Buy credits once, in any partner app, and spend the leftover in every other one. Every credit is backed by USDT on Whitechain. |
| Stats | `1 credit = $0.01` · `0 crypto steps` · `100% backed` |
| Two-tone H2 | Everyone sells their own credits. / We made one that works everywhere. |
| Section H2s | Built for real products. / Add it in about 20 lines. / Every credit is provably backed. / Your next app already has a balance. |
| CTA | Start building · Join the network |

---

## 4. Layout

### 4.1 Frame

The whole page sits inside a bordered frame, like a sheet of paper.

```
body            bg wc-surface
.container      max-width 1400px, margin auto, padding-inline 32px from 1024px
.frame          border 1px wc-surface-2, bg wc-surface, overflow hidden
  section       border-top 1px wc-border-light (every section after the first)
```

Header is fixed, 64px tall, 72px from 1024px, inside the same container with its own 1px `wc-surface-2` border, background `wc-bg` at 70% with `backdrop-blur(24px) saturate(150%)`. Page content starts with `padding-top: 64px` (72px from 1024px) plus `env(safe-area-inset-top)`. Sections use `scroll-margin-top` of the same value.

### 4.2 Spacing

| Token | Value |
|---|---|
| Section top padding | `clamp(3.5rem, 2.84rem + 2.7vw, 5rem)` |
| Gutter | 24px, 32px from 640px, 64px from 1024px |
| Section head to grid | 48px (`mt-12`) |
| H2 to description | 20px |
| Description to buttons | 24px to 36px |
| Tile padding | 24px 24px, 32px from 640px, 64px 56px from 1024px |
| Stat grid | padding 64px top 56px bottom, 80px/120px from 1024px, gap 32px/40px |

### 4.3 Hairline grid

Tiles never have their own borders. The parent grid carries the border color as its background and tiles are white:

```html
<div class="grid grid-cols-1 gap-px border-t border-wc-border-light bg-wc-border-light md:grid-cols-2 lg:grid-cols-4">
  <div class="bg-wc-surface px-6 py-10 sm:px-8 lg:px-16 lg:py-14">…</div>
</div>
```

Tiles have `border-radius: 0`. Only controls, the terminal, chips, and the newsletter well are rounded.

### 4.4 Radii

| Token | Value | Use |
|---|---|---|
| `radius-control` | 14px | Buttons, inputs |
| `radius-card` | 24px | Floating panels only (modals, toasts) |
| `radius-chip` | 999px | Chips, pills |
| terminal | 10px | Terminal window |
| newsletter well | 12px | Input group on dark |
| chip inline | 20px | "<$0.01 Avg. Transaction Cost" badge |

### 4.5 Breakpoints

Tailwind defaults: 640, 768, 1024, 1280, 1536. The hero switches to a two-column grid at 768px (`1fr 320px`) and 1024px (`1fr 360px`, height 643px). Feature tiles go to 6 columns at 1024px with each tile spanning 2.

### 4.6 Z-index

`header 30`, `overlay 40`, `modal 50`, `popover 60`, `toast 70`, `tooltip 80`. Canvas fields are `z-0`, content above them is `z-10`.

---

## 5. Components

### 5.1 Button

Base: `inline-flex items-center justify-center gap-2 font-display font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-wc-blue/40 disabled:opacity-50 disabled:pointer-events-none rounded-control`

| Variant | Classes |
|---|---|
| `default` | `bg-wc-blue text-white hover:bg-wc-blue-2 hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.16),0_12px_16px_0_rgba(0,68,255,0.24)]` |
| `primary` | `bg-wc-navy font-semibold text-wc-surface hover:bg-wc-neutral-15 hover:text-wc-mint-pastel` |
| `secondary` | `bg-wc-surface-2 text-wc-text-1 hover:bg-wc-border/70` |
| `outline` | `border border-wc-border bg-transparent text-wc-text-1 hover:bg-wc-surface-2/60` |
| `outline` on white, blue text | add `bg-wc-surface text-wc-blue` (used for "Join the community", "Explore WBT") |
| `ghost` | `bg-transparent text-wc-text-1 hover:bg-wc-surface-2/60` |
| `link` | `bg-transparent text-wc-blue underline-offset-2 hover:underline` |
| `accent` | `bg-wc-lime font-semibold text-wc-surface-dark hover:bg-wc-lime-2 hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.16),0_12px_16px_0_rgba(220,242,24,0.24)] active:bg-wc-lime-3` |

| Size | Classes |
|---|---|
| `xs` | `h-7 px-3 text-[12px]` (square: `w-7 p-0`) |
| `sm` | `h-9 px-3.5 text-[13px]` |
| `md` | `h-10 px-4 text-body` (default) |
| `lg` | `h-11 px-[18px] text-body` |

Header uses `default md` next to `outline md`. Hero uses `default md` and `outline md` with `bg-wc-surface`. Section CTAs use `lg`. On mobile, buttons stack full width with 16px gap, then go inline with 20px gap.

Optional `scramble` prop: on hover the label is re-typed with random glyphs (see 7.6). Optional `chevron` prop: arrow icon nudges up-right on hover.

### 5.2 Header

```
[logo 120px]  Builders  Blog  Bridge            [x] [tg] [dc]  [Start building]
```

- Nav links: 16px weight 500 `wc-text-muted`, hover `wc-navy`, gap 24px (32px from 1280px).
- Social icons: 18px, `wc-navy`, hover `wc-blue`, gap 20px.
- Mobile: `default sm` button plus a 40px square menu toggle.

### 5.3 Hero

Two columns from 768px. Left: H1, lead, two buttons, padded 24px (32/56 from 768, 64/64 from 1024). Right: a glass panel pinned to the bottom (`self-end`).

Background layers, bottom to top:
1. Placeholder wash while the canvas loads: `bg-[radial-gradient(85%_85%_at_100%_100%,var(--color-wc-dither-1)_0%,transparent_70%)]`.
2. `DitherField` with `focus {x:1, y:1}`, `radius 0.85`, `gap 22`, `glyph "plus"`. Between 768 and 1024px it is masked with `linear-gradient(to right, transparent 380px, #000 500px)` so it stays clear of the text.
3. On mobile the text column gets `bg-gradient-to-b from-wc-surface/64 from-70% via-wc-surface/64 via-90% to-transparent` so copy stays readable over the dots.

Glass panel: `.glass-surface` = `bg white/80, border white/70, backdrop-blur(12px)`, padding 24px (32 from 768, 40 from 1024), 24px vertical gap. Contains a 15px semibold title in `wc-ink-2`, a 15px medium line in `wc-navy`, then two stats (24px weight 400 `wc-ink-2` number, 15px medium `wc-navy` label).

Dark variant `.glass-surface-dark` = `bg #000722/70, border #1E3D80/70, blur 12px`.

### 5.4 Stat row

Three columns from 640px. Each stat is `flex-col-reverse` so the number is read first by screen readers but the label sits below it. Numbers use `CountUp` (7.4).

### 5.5 Feature tile with image dots

Desktop (from 1024px): a 270px tall stage, centered, `DotGridTwinkle` plus-grid behind an `ImageLeafletField` of 188px that renders a monochrome PNG as leaf dots (`cell 5`, `fitPx 188`). Below the stage: 20px/30px semibold title, 16px body in `wc-text-muted`, optional chip.

Mobile: 80px dot image (`cell 3`, `fitPx 80`) left of the text, 24px gap.

### 5.6 Link tile

```html
<a class="group flex h-full flex-col bg-wc-surface px-6 py-10 transition-colors hover:bg-wc-bg sm:px-8 lg:px-16 lg:py-14">
  <div class="flex items-center justify-between">
    <span class="text-[18px] font-semibold leading-[27px] text-black">Docs</span>
    <ArrowUpRight class="size-[15px] text-wc-icon-muted transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-wc-blue" />
  </div>
  <p class="mt-1.5 text-[15px] leading-[24.375px] text-wc-text-muted">Guides & RPC reference</p>
</a>
```

### 5.7 Partner logo tile

`h-36 min-w-[45%] flex-1 items-center justify-center bg-wc-surface p-10`. Logo scales to 1.07 on hover over 200ms ease-out. An optional highlight layer fades in a plus-pattern background (see 6.7) over 1000ms when the tile is active.

### 5.8 Marquee

A row of 112px tall cells, each with `border-r border-wc-border-light` and 32px horizontal padding. The track is duplicated once for a seamless loop and masked with `linear-gradient(90deg, transparent, #000 8%, #000 82%, transparent)`. Speed: 38s per loop, 44s for the reverse row. A 28px square `outline xs` play/pause button sits top-right above the track. Pauses on hover, focus, and when the tab is hidden.

### 5.9 Terminal

```
┌ ● ● ●  whitechain – zsh                              copy ┐
│                                                           │
│  # comment in navy-mute                                   │
│  $ npm create whitechain@latest my-dapp     ($ in lime)   │
│  │ chain    Whitechain – EVM on the OP Stack              │
│  ◆ contracts deployed to testnet in 4.05s                 │
│                                                           │
│  [ascii art, 10px mono, blue]                             │
│  $ ▍  (lime cursor, pulses)                               │
└───────────────────────────────────────────────────────────┘
```

- Window: `rounded-[10px] border border-wc-border-dark bg-wc-surface-dark shadow-terminal`.
- `shadow-terminal` = `0 24px 70px -30px rgba(0,9,51,0.7)`.
- Chrome bar: 3 dots of 12px `bg-wc-border-dark`, title 13px `wc-navy-mute`, border-bottom `wc-border-dark-muted`, padding 12px 20px 13px.
- Body: 24px padding, 13px mono, line height 1.7. Prompt `$` and `◆` in `wc-lime`, commands white, labels `wc-navy-mute`, values `wc-text-dark-2`.
- Cursor: 7x15px `bg-wc-lime` with `animate-pulse`.
- Copy button: 13px `wc-navy-mute`, hover white, shows "copied" for 1.6s.

For our product the terminal shows the 20-line integration:

```
$ npm i kredo
│ network  Whitechain · USDT settled
│ gas      paid by the relayer, never by users
│ limit    enforced onchain, per app
◆ first charge settled in 2.1s
```

### 5.10 Dark CTA band

`border-t border-wc-border-dark-muted bg-wc-surface-dark text-wc-surface`, padding 96px vertical (144 from 640px), centered. Behind it a `DotGridTwinkle` with `ink #6A7F9C`, at 60% opacity below 1024px. H2 40/56px, 18px lead, then `default lg` plus `outline lg bg-wc-surface text-wc-blue`.

### 5.11 Footer

Dark. Inside the container, `border-x border-wc-border-dark-muted`.

1. Newsletter block: H2 28px/40px white, label 17px `wc-text-dark-2`, input well `rounded-xl border border-wc-border-dark bg-wc-bg-dark p-[5px]` containing a transparent input (placeholder `wc-text-dark-3`) and a `secondary md` submit.
2. Glyph band: 144px tall (296 from 640px), `DitherField` with `invert true`, `focus {0.5, 0.5}`, `radius 0.75`, `gap 22`, `glyph "plus"`, dark dither ramp, `ink #9FB2CC`. The 80px white brand glyph sits centered on top. Inverted means dots are dark at the center and brighten toward the edges, so the glyph sits in a calm pool.
3. Link columns: 2 columns, 4 from 768px. Heading 13px `wc-text-dark-3`, links 16px `wc-text-dark-2` hover white, 16px vertical gap.
4. Legal: 12px caption, copyright line.

### 5.12 Chip

`inline-flex rounded-[20px] bg-wc-neutral-80 px-2 py-0.5 text-[14px] font-medium leading-[22.5px] text-wc-text-2`.

### 5.13 Accordion disclaimer

Right-aligned 12px `wc-icon-muted` trigger with a 16px chevron that rotates 180° over 200ms.

### 5.14 Skeleton

`animate-pulse bg-wc-surface-2`, radius 14px for text lines, 0 for images.

### 5.15 Brand mark

A rounded square with a notched top-right and bottom-left corner, a blue rounded square behind it, and a white square inside carrying a navy quarter-circle "leaf". The leaf is the glyph every dot field draws.

Logo file: `/logo.svg` at 120px wide in the header. Footer glyph: `/footer-glyph.svg`, 80px, white.

---

## 6. Dot systems

Five renderers share one canvas runtime. All draw into a `<canvas class="h-full w-full">` inside `<div aria-hidden class="pointer-events-none absolute inset-0">`, sized to the host element.

### 6.1 Runtime

```ts
type Loop = {
  canvas: HTMLCanvasElement; host: HTMLElement;
  reducedMotion: boolean;
  draw: (t: number) => void;
  onResize?: (w: number, h: number) => void;
  onFirstVisible?: (t: number) => void;
  dprCap?: number;         // default 2
  frameBudgetMs?: number;  // default 16
  pauseOffscreen?: boolean;// default true
  revealOnVisible?: boolean;// default false, uses threshold 0.2
};
```

- Size from `host.getBoundingClientRect()`, scale by `min(devicePixelRatio, 2)`, `ctx.setTransform(dpr,0,0,dpr,0,0)`.
- `requestAnimationFrame` loop, skip frames closer than the budget.
- `ResizeObserver` on the host re-sizes and, under reduced motion, redraws once.
- `IntersectionObserver` pauses the loop offscreen and fires `onFirstVisible` once.
- Reduced motion: draw a single static frame, attach no pointer listeners.

### 6.2 Shared math

```ts
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth  = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const hash    = (x: number, y: number, z: number) =>
  Math.abs(43758.5453 * Math.sin(12.9898 * x + 78.233 * y + 37.719 * z)) % 1;

// slow drifting brightness per cell, 0..1
const twinkle = (c: number, r: number, t: number) =>
  0.5 + 0.24 * Math.sin(0.42 * c + 0.31 * r + 0.7 * t)
      + 0.20 * Math.sin(0.21 * c - 0.45 * r - 0.55 * t + 1.7)
      + 0.14 * (hash(c, r, 1) - 0.5);

// 4x4 Bayer matrix, returns 0..15/16
const BAYER = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];
const bayer = (c: number, r: number) => BAYER[(r & 3) * 4 + (c & 3)] / 16;

// quantize a 0..1 value into 4 dither levels with ordered noise
const level = (v: number, b: number) => Math.min(4, 4 * v + (b - 0.5) * 1.6);
const pick  = (colors: string[], lv: number) => colors[Math.max(1, Math.min(4, Math.round(lv))) - 1];

// per-cell rotation, quarter turns
const rot = (c: number, r: number) => ((7 * c + 13 * r) % 4) * Math.PI / 2;
```

### 6.3 The leaf glyph

Every dither dot is the brand leaf, a quarter circle with a straight hypotenuse.

```ts
const LEAF = new Path2D(
  "M179.816 166.62C161.445 184.611 131.956 184.495 113.731 166.27" +
  "C95.505 148.044 95.3878 118.554 113.379 100.184L179.816 166.62Z"
);
// draw centered at (x,y) with the given size in px and rotation
function leaf(ctx, x, y, size, angle) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  const s = size / 84.4; ctx.scale(s, s);
  ctx.translate(-137.6, -142.4);
  ctx.fill(LEAF); ctx.restore();
}
```

### 6.4 Plus grid (`DotGridTwinkle`)

The quiet background texture under feature stages, the institutional panel, and the dark CTA.

- Pitch 22px, cells centered at `22i + 11`.
- Per cell `v = clamp01(twinkle(c, r, t))`, `t` in seconds.
- Size `f = 1.2 * (0.4 + 1.1 v)`, arm length `1.7 f`, line width `max(0.7, 0.55 f)`.
- Color `rgba(ink, 0.035 + 0.18 v)`.
- Glyph options: `plus` (default on this site), `cross` (rotated 45°), `dot` (circle of radius `f`).
- Ink: `#030712` on white, `#6A7F9C` on dark.

### 6.5 Dither field (`DitherField`)

The hero field. A plus grid plus a second layer of leaf dots that brighten toward a focus point, ripple under the pointer, and reveal on load.

Props and defaults: `colors` light dither ramp, `focus {x:1, y:1}`, `gap 22`, `glyph "plus"`, `radius 0.85`, `invert false`, `ink #030712`, `pointerInteractive` true only on `(hover: hover) and (pointer: fine)`.

Per frame:

```ts
reveal = reducedMotion ? 1 : smooth((now - start) / 1100);
t = now / 1000;

// layer 1: plus grid at every (c*gap, r*gap), using twinkle + 0.85 * ripple(x, y)
// layer 2: leaf dots at cell centers (c*gap + gap/2, r*gap + gap/2)
for each cell:
  d  = hypot(x - focusX, y - focusY) / (radius * max(width, height));
  f  = invert ? max(0, 1.3 d - 0.15) : max(0, 1.22 - 1.3 d);
  if (f <= 0.02) continue;
  target = (f + 0.1 * sin(9 d - 0.5 t)) * reveal + ripple(x, y);
  state[i] += (target - state[i]) * (reducedMotion ? 1 : 0.14);   // smoothing
  lv = level(state[i], bayer(c, r));
  if (lv <= 0.12) continue;
  size = gap * (0.22 + 0.135 lv);
  fill = pick(colors, lv);
  leaf(ctx, x, y, size, rot(c, r));
```

Pointer ripples:

```ts
// keep the last 14 impulses
add(originX, originY, amplitude);           // move: 0.6 every 70ms, press: 1.3
strength(x, y, now) = Σ over impulses with age τ < 1.7s:
  sin(dist / 16 - 9 τ) * exp(-dist / 210) * exp(-2.4 τ) * 0.55 * amplitude
```

Where it is used:

| Place | focus | radius | invert | colors | ink |
|---|---|---|---|---|---|
| Hero | 1, 1 (bottom right) | 0.85 | no | light ramp | `#030712` |
| Footer glyph band | 0.5, 0.5 | 0.75 | yes | dark ramp | `#9FB2CC` |

### 6.6 Image dots (`ImageLeafletField`, `ImageLeafletMorph`)

Turns a monochrome PNG into a field of leaf dots whose size follows the image's darkness. Used for the three feature tile illustrations, the WBT panel, and the 404 page.

Sampling:

```ts
// draw the image into an offscreen canvas of cols x rows (one pixel per cell)
// fit: "contain" (default) or "cover", or fitPx to size the long edge in px
value[i] = clamp01(alpha * (1 - luma) * gain);   // luma = .299R + .587G + .114B, gain 1.25
```

Per frame:

```ts
wobble = 0.15 sin(0.55 c + 0.4 r + 1.15 t) + 0.10 sin(0.3 c - 0.55 r - 0.85 t + 1.3);
v  = clamp01(value[i] + wobble) * reveal;          // reveal smooth over 1100ms once 20% visible
lv = level(v, bayer(c, r)); if (lv <= 0.12) skip;
size = cell * (0.34 + 0.16 lv) * boost;
leaf(ctx, x + dx, y + dy, size, rot(c, r));
```

Pointer (fine pointers only):

- Hover boost near the cursor: `k = hover * exp(-(dx² + dy²) / 9216)`, `boost = 1 + 0.133 k`, dots push away by `-0.1 * (dx, dy) * k`. `hover` eases to 1 on enter and 0 on leave at 0.12 per frame.
- Parallax of the whole field: target offset `0.04 * (cursor - canvas center) * exp(-(dist²) / 462400)`, sampled every 50ms, eased at 0.1 per frame.

Morph variant: several sources, cross-faded per cell with `smooth((now - start) / morphMs)`. `morphMs 1300`. `cycle "timer"` holds 2200ms between images; `cycle "scroll"` picks the image by viewport progress with thresholds 0.44 and 0.58 and holds 900ms.

Presets:

| Place | cell | fitPx | colors |
|---|---|---|---|
| Feature tile, desktop | 5 | 188 | leaflet ramp |
| Feature tile, mobile | 3 | 80 | leaflet ramp |
| WBT panel (3 images, timer) | 8 | contain | leaflet ramp |
| 404 glyph | 8 | 320 | leaflet ramp |

Source images are black shapes on transparent, roughly 400 to 800px wide. Simple silhouettes work best: a shield, a chain link, a coin.

### 6.7 Cross hatch (`CrossHatchPattern`)

A sparse field of tiny crosses that fades out downward. Sits behind section headers (builders, partner network).

- Fixed height 539px, full width, pinned to the top of the section.
- Column pitch `14 * 2/3`, row pitch 14, 40 rows.
- Draw only where `(col + row) % 6 == 0`.
- Fade `s = max(0, 1 - y / 539)`.
- Alpha `0.2 * s * (0.22 + 0.9 * clamp01(0.5 + 0.3 sin(0.5 col + 0.38 row + 0.8 t) + 0.22 sin(0.28 col - 0.5 row - 0.6 t + 1.7)))`.
- Cross arms 2.6px, line width 1, round caps, `rgba(8, 10, 40, alpha)`.
- 30fps cap (33ms budget).

### 6.8 Static plus pattern (CSS)

A tiled SVG for hover highlights where a canvas is overkill.

```ts
const plusPattern = ({ color = "#030712", opacity = 0.21, pitch = 44, size = 12, strokeWidth = 2 }) =>
  `data:image/svg+xml;utf8,` + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pitch}" height="${pitch}">` +
    `<path d="M${pitch/2} ${pitch/2 - size/2}v${size}M${pitch/2 - size/2} ${pitch/2}h${size}" ` +
    `stroke="${color}" stroke-opacity="${opacity}" stroke-width="${strokeWidth}"/></svg>`);
```

### 6.9 ASCII coin (optional)

A spinning brand glyph rendered as 46x26 characters from the ramp `" .,:;irsXA253hMHGS#9B&@"`, 10px mono, `wc-blue`, inside the terminal. Rotation speed `0.55 + 1.9 * (1 - |cos θ|)` so it lingers face-on. Skip unless there is time.

### 6.10 Placement rules

- One dither field per page, in the hero. One inverted field in the footer.
- Plus grids go behind illustration stages and dark bands, never behind body text.
- Image dot fields are the only illustrations. No photos, no 3D renders, no icons larger than 24px.
- Fields are `aria-hidden` and `pointer-events-none`.
- Every field has a static fallback: a radial wash for the hero, nothing for the rest.

---

## 7. Motion

### 7.1 Tokens

| Token | Value |
|---|---|
| `dur-fast` | 120ms |
| `dur-base` | 200ms |
| `dur-slow` | 320ms |
| `ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `ease-out` | `cubic-bezier(0, 0, 0.2, 1)` |
| `ease-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` |

Color and background transitions use `dur-fast` to `dur-base`. Transforms use `ease-out` 200ms.

### 7.2 Rise

Every section's header block enters with:

```css
@keyframes rise { from { opacity: 0.01; transform: translateY(12px) } to { opacity: 1; transform: none } }
.animate-rise { animation: rise 600ms cubic-bezier(0.16, 1, 0.3, 1) both; }
```

Apply as `motion-safe:animate-rise`. No stagger, no scroll trigger: it runs on mount.

### 7.3 Marquee

```css
@keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
.animate-marquee         { animation: marquee 38s linear infinite; }
.animate-marquee-reverse { animation: marquee 44s linear infinite reverse; }
```

### 7.4 Count up

Stat numbers count from 0 to the target over 1400ms with `1 - (1 - p)³` easing, once 40% of the element is visible. Prefix, decimals, and suffix are preserved (`<$0.01`, `53M+`). If the element is already in view on load, it renders the final value with no animation.

### 7.5 Intro reveal (scroll-linked word fade)

A paragraph whose words fade in as it scrolls into the viewport. Progress `p` runs from 0 when the top is at 95% of the viewport to 1 when it reaches `endFraction` of the viewport height. Word `i` of `n` has `opacity = 0.18 + 0.82 * clamp01(p * n - i)`, so words light up left to right with a 150ms opacity transition. Resting opacity for unrevealed text is 0.18.

The list variant draws a 12px `wc-blue` square before each line that scales from 0.4 to 1 and fades 0 to 1 with the same progress.

### 7.6 Scramble hover

On `mouseenter` of a `.group`, the label is retyped: every 22ms the active index advances (every second tick), the active character shows a random glyph from `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$*+=/<>` in `text-wc-lime`, characters before it are real, after it are invisible. Width is locked so layout does not shift. On leave it snaps back.

### 7.7 Micro interactions

| Element | Behaviour |
|---|---|
| Link tile arrow | `translate(2px, -2px)` and color to `wc-blue`, 150ms |
| Partner logo | `scale(1.07)`, 200ms ease-out |
| Blue button | background to `wc-blue-2`, blue glow shadow |
| Nav link | color to `wc-navy` |
| Accordion chevron | `rotate(180deg)`, 200ms |
| Terminal cursor | `pulse` 2s, opacity to 0.5 at 50% |
| Sticky onchain header | pins at 88px from the top on 1024px and up while its list scrolls |

### 7.8 Reduced motion

Under `prefers-reduced-motion: reduce`: `rise`, `marquee`, and `pulse` are removed; canvases draw one frame; count up and word reveal render final state; scramble is disabled; pointer listeners are not attached.

---

## 8. Page skeleton

Section order for the landing page, each separated by a `wc-border-light` hairline:

1. **Hero**: dither field, H1, lead, two buttons, glass stats panel.
2. **Stats**: three count-up numbers.
3. **Two-tone statement**: plus grid on the left with the two-tone H2 and a `default` button, scroll-revealed list on the right.
4. **Built for real products**: eyebrow, H2, 3 feature tiles with image dots.
5. **Partners**: H2, logo marquee.
6. **Everything in one place**: 2 by 3 grid of link tiles (Connect, Buy, Wallet, Dashboard, Reserves, Directory).
7. **Build**: cross hatch, eyebrow "Build", H2, 4 numbered steps, buttons, terminal on the right.
8. **Backed**: eyebrow "Reserves", H2, live vault number next to credits outstanding, outline button.
9. **Dark CTA**: plus grid, big H2, two buttons.
10. **Latest**: 3 post cards (only if we publish anything).
11. **Footer**: newsletter, glyph band, link columns, legal.

Product screens (connect, buy, wallet, dashboard) use the same frame, the `secondary` and `outline` buttons, hairline tables, and a single plus grid behind the page title. No dither fields inside app screens.

---

## 9. Do and don't

Do

- Put a period at the end of every headline.
- Use the hairline grid for any set of equal items.
- Keep dot opacity under 0.22 away from the focus point.
- Use `wc-blue` only for actions and one highlighted line per screen.
- Use lime only inside terminals, cursors, and the accent button.

Don't

- Don't add shadows to tiles or cards. Only the terminal and hovered blue button cast one.
- Don't round tiles. Only controls and floating panels have radius.
- Don't use gray backgrounds to separate sections. Use a 1px line.
- Don't animate layout. Animate opacity, transform, color, and dots.
- Don't put dots behind paragraphs.
- Don't introduce a second typeface or a second accent hue.

---

## 10. Tailwind theme

```css
@import "tailwindcss";

@theme {
  --font-display: "Onest", system-ui, sans-serif;
  --font-sans: "Onest", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --color-wc-blue: #0066ff;
  --color-wc-blue-2: #3385ff;
  --color-wc-navy: #080a28;
  --color-wc-ink: #07081e;
  --color-wc-ink-2: #000a47;
  --color-wc-ink-3: #001078;
  --color-wc-text-1: #07081e;
  --color-wc-text-2: #4a5567;
  --color-wc-text-muted: #45464d;
  --color-wc-icon-muted: #6a6a72;
  --color-wc-mute: #97a2b6;
  --color-wc-navy-mute: #5a6b93;
  --color-wc-surface: #ffffff;
  --color-wc-bg: #f8faf9;
  --color-wc-surface-2: #e3e8ef;
  --color-wc-neutral-80: #f5f5f5;
  --color-wc-neutral-30: #d2d3d8;
  --color-wc-neutral-20: #5e6073;
  --color-wc-neutral-15: #323346;
  --color-wc-border: #c7d0dc;
  --color-wc-border-light: #e6e6ec;
  --color-wc-dither-1: #dfe5ec;
  --color-wc-lime: #dcf218;
  --color-wc-lime-2: #e6f84a;
  --color-wc-lime-3: #c8dd15;
  --color-wc-mint: #68ecbc;
  --color-wc-mint-2: #60e9b1;
  --color-wc-mint-pastel: #a4f4d7;
  --color-wc-error: #e24137;
  --color-wc-warning: #ed7536;

  --color-wc-bg-dark: #000722;
  --color-wc-surface-dark: #000933;
  --color-wc-border-dark: #1e3d80;
  --color-wc-border-dark-muted: #122a5e;
  --color-wc-text-dark-1: #ffffff;
  --color-wc-text-dark-2: #9fb2cc;
  --color-wc-text-dark-3: #6a7f9c;

  --radius-control: 14px;
  --radius-card: 24px;
  --radius-chip: 999px;

  --container-app-narrow: 1400px;
  --spacing-section-t: clamp(3.5rem, 2.84rem + 2.7vw, 5rem);

  --text-body: 16px;
  --text-body--line-height: 1.5;
  --text-heading-lg: 18px;  --text-heading-lg--line-height: 26px;  --text-heading-lg--font-weight: 500;
  --text-heading-xl: 24px;  --text-heading-xl--line-height: 32px;  --text-heading-xl--font-weight: 500;
  --text-heading-2xl: 32px; --text-heading-2xl--line-height: 40px; --text-heading-2xl--font-weight: 500;
  --text-heading-3xl: 48px; --text-heading-3xl--line-height: 56px; --text-heading-3xl--font-weight: 500;

  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 0.12s;
  --dur-base: 0.2s;
  --dur-slow: 0.32s;

  --animate-rise: rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  --animate-marquee: marquee 38s linear infinite;
  --animate-marquee-reverse: marquee 44s linear infinite reverse;

  --z-header: 30; --z-overlay: 40; --z-modal: 50; --z-popover: 60; --z-toast: 70; --z-tooltip: 80;
}

@keyframes rise    { 0% { opacity: 0.01; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
@keyframes marquee { 0% { transform: translateX(0) } to { transform: translateX(-50%) } }

@layer base {
  html { font-size: 16px; scroll-behavior: smooth; }
  body { font-family: var(--font-display); background: var(--color-wc-surface); color: var(--color-wc-text-1); }
  ::selection { background: var(--color-wc-blue-2); color: var(--color-wc-surface); }
}

@utility type-hero    { font-size: clamp(2.5rem, 2.28rem + 0.9vw, 3rem); line-height: 1.06; }
@utility type-section { font-size: 1.75rem; line-height: 1.3; @media (min-width: 768px) { font-size: clamp(2rem, 1.25rem + 1.5625vw, 2.5rem); } }
@utility rounded-control { border-radius: var(--radius-control); }
@utility pt-section-t { padding-top: var(--spacing-section-t); }
@utility pb-section-t { padding-bottom: var(--spacing-section-t); }
@utility glass-surface { background: color-mix(in srgb, var(--color-wc-surface) 80%, transparent); border-color: color-mix(in srgb, var(--color-wc-surface) 70%, transparent); backdrop-filter: blur(12px); }
@utility glass-surface-dark { background: color-mix(in srgb, var(--color-wc-bg-dark) 70%, transparent); border-color: color-mix(in srgb, var(--color-wc-border-dark) 70%, transparent); backdrop-filter: blur(12px); }
@utility shadow-terminal { box-shadow: 0 24px 70px -30px color-mix(in srgb, var(--color-wc-surface-dark) 70%, transparent); }

@media (prefers-reduced-motion: reduce) {
  .animate-rise, .animate-marquee, .animate-marquee-reverse { animation: none; }
}
```

Fonts:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@300;400;500;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
```
