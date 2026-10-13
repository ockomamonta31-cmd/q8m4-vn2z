---
name: Dota Match Lab
description: A self-hosted Dota 2 match explainer, built as one minute axis over river-teal water.
colors:
  riverbed: "#0a1e26"
  river: "#12323c"
  stone: "#19414d"
  stone-2: "#1f4f5d"
  ink: "#eaf3f5"
  ink-2: "#a9c4cc"
  ink-3: "#89acb8"
  ink-4: "#4a6b77"
  radiant: "#4fd18b"
  radiant-ink: "#7fe3b4"
  dire: "#ef5f4f"
  dire-ink: "#ff8a7a"
  aegis: "#f0c46a"
  shard: "#7fb6e8"
typography:
  display:
    fontFamily: "'PT Sans Narrow', 'Arial Narrow', 'Helvetica Neue', sans-serif"
    fontSize: "clamp(40px, 5.6vw, 104px)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.012em"
  headline:
    fontFamily: "'PT Sans Narrow', 'Arial Narrow', 'Helvetica Neue', sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "normal"
  title:
    fontFamily: "'PT Sans Narrow', 'Arial Narrow', 'Helvetica Neue', sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
  stat-numeral:
    fontFamily: "'PT Sans Narrow', 'Arial Narrow', 'Helvetica Neue', sans-serif"
    fontWeight: 700
    fontFeature: '"tnum" 1, "lnum" 1'
    letterSpacing: "0.005em"
  body:
    fontFamily: "'Golos Text', 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "'Golos Text', 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  r-node: "2px"
  r-ctl: "5px"
  r-panel: "9px"
  r-plate: "16px"
  r-pill: "999px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
  s-8: "64px"
  s-9: "96px"
components:
  button-primary:
    backgroundColor: "{colors.aegis}"
    textColor: "#1b1405"
    rounded: "{rounded.r-ctl}"
    height: "38px"
    padding: "0 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.r-ctl}"
    height: "38px"
    padding: "0 16px"
  button-ghost-hover:
    backgroundColor: "{colors.stone-2}"
    textColor: "{colors.ink}"
  chip:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.r-ctl}"
    height: "26px"
    padding: "0 12px"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.r-node}"
    padding: "3px 12px"
  panel:
    backgroundColor: "{colors.stone}"
    rounded: "{rounded.r-panel}"
  search-field:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r-ctl}"
    height: "36px"
    padding: "0 62px 0 36px"
  gate-input:
    backgroundColor: "{colors.riverbed}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r-ctl}"
    height: "60px"
    padding: "0 24px"
  subnav-tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.r-ctl}"
    padding: "12px 16px"
  subnav-tab-selected:
    backgroundColor: "{colors.stone-2}"
    textColor: "{colors.ink}"
---

# Design System: Dota Match Lab

## Overview

**Creative North Star: "The River Spine"**

One minute axis runs across a river-teal field, and the whole product is drawn off it. The page background is not "dark" — it is *river water* (`--river` #12323c at 197° and 55% saturation, a genuinely colored surface), the deepest point of the map where the two camps meet. The signature element, the PowerSpine, is a single full-width hairline: advantage runs as blocks whose width equals the minutes a state actually held, camp events sit as nodes above the axis for Radiant and below for Dire, and a native range thumb scrubs a minute into focus while the rest of the field fades to a faint bar pattern. Everything else — hero plate, rosters, charts, timeline — is arranged as branches of that same axis.

The world is deliberately monochrome-teal apart from three meaning-carrying pigments: the Radiant/Dire camp pair (state, never decoration) and Roshan's Aegis gold (the only "you can act here / something was won" signal), plus one borrowed blue for the Aghanim's Shard that arrives from the item, not the interface. There is exactly one dark world; the light theme was removed on purpose, so there is no `data-theme="light"` override to maintain. Depth is conveyed by tone (riverbed → river → stone → stone-2), not by glow: a node is filled or hollow, never lit. Two condensed Cyrillic families carry the read — PT Sans Narrow for the display voice and every statistic numeral, Golos Text for UI prose.

**Key Characteristics:**
- One minute axis over colored water; the two camps are its two branches.
- Camp color (green/red) is never the sole carrier of meaning — glyph shape, row order, and the lane map are independent cues.
- Aegis gold appears only where something is actionable or was won; its rarity is the point.
- Ranked radii, one per hierarchy tier — never a single blanket corner.
- Ink is tinted from the river's own hue; there are no neutral grays on a colored ground.
- Flat by default; tonal layering does the depth work, and two structural shadows are reserved for states.

## Colors

A teal-water ground with a tinted ink ramp and three semantic pigments — the surface itself is the calm, and color is rationed out only to say something.

### The Camp Pair — state, not decoration
- **Radiant Moss** (`--radiant` #4fd18b) and its text sibling **Radiant Ink** (`--radiant-ink` #7fe3b4): the left/top branch of the axis. `--radiant` fills and strokes nodes, camp rails, and win states; `--radiant-ink` is the readable variant used wherever a Radiant value is set as type (score, names, tallies, advantage figures).
- **Dire Ember** (`--dire` #ef5f4f) and **Dire Ink** (`--dire-ink` #ff8a7a): the right/bottom branch, same division of labor. `--dire-deep` #2b1210 and `--radiant-deep` #0d2a22 are the near-black camp wells used in the hero wedge and error notice; `--radiant-wash` / `--dire-wash` (11% alpha) tint the world gradient's two corners and the team headers.

Because Radiant/Dire is literally a green/red pair, the system treats colorblindness as a first-class failure mode (see the hard rules below).

### The Gold — the one action & victory signal
- **Aegis Gold** (`--aegis` #f0c46a): the system's single true accent, and it is rationed. It is the primary button fill, the `:focus-visible` outline, the text caret, the selection background, the minute-scrub thumb and its active readout, sort/filter arrows on hover and when active, the copy-match-ID affordance, the MVP marker, the "me in this fight" highlight, milestone chips, decisive teamfights, and the Roshan node on the spine. `--aegis-deep` #2b2110 and `--aegis-wash` (13% alpha) are its quiet wells. Dark ink `#1b1405` is the only text placed on gold.

### The Shard — the single borrowed blue
- **Aghanim Shard** (`--shard` #7fb6e8): the only blue in the interface. It appears exclusively as the inset ring on scepter/shard item slots (`--r-node` wells). It is not a palette color and not reusable for UI meaning — it is allowed because it *is* the item's own color.

### Depth & Surface — the world ground
- **Riverbed** (`--riverbed` #0a1e26): the deepest field; the root `html` background, the footer/topbar, input wells, and the "off" state of tracks.
- **River Water** (`--river` #12323c): the page background and the `theme-color`; the light stop of the world gradient and the track gutter color.
- **Stone Rail** (`--stone` #19414d): the default panel/card/table surface — the workhorse ground for content and the surface the ink contrast ratios are measured on.
- **Lit Stone** (`--stone-2` #1f4f5d): the raised/hover/active surface (selected tab, hovered row, `:focus` search fill).
- Hairline rules `--rule` (rgba(150,202,216,.14)) and `--rule-2` (.28) do nearly all "bordering"; skeleton shimmer `--skel-a`/`--skel-b` are placeholders.

### The Ink Ramp — text
- **Surface Ink** (`--ink` #eaf3f5): primary text on stone.
- **Second Ink** (`--ink-2` #a9c4cc): secondary text, placeholders, ghost/chip labels.
- **Quiet Ink** (`--ink-3` #89acb8): captions, section notes, table headers, muted figures. This is the *faintest* legal text color.
- **Hairline Ink** (`--ink-4` #4a6b77): **not a text color.** See the rule below.

### The Contrast Ledger (measured, numerically verified)
All measured against the panel workhorse **Stone** unless noted:

| Token | Hex | Contrast on stone | Legal use |
|---|---|---|---|
| `--ink` | #eaf3f5 | **12.05:1** | any text |
| `--ink-2` | #a9c4cc | **7.40:1** | any text (secondary) |
| `--ink-3` | #89acb8 | **4.55:1** on stone / **5.60:1** on river | small/caption text only |
| `--radiant-ink` | #7fe3b4 | **8.76:1** | Radiant figures as text |
| `--dire-ink` | #ff8a7a | **5.93:1** | Dire figures as text |
| `--aegis` | #f0c46a | **8.28:1** | gold as text |
| button text `#1b1405` | #1b1405 | **11.15:1** on `--aegis` | text on gold |
| `--ink-4` | #4a6b77 | **2.37:1** | **strokes / separators / icons only — never text** |

`--ink-3` clears AA for normal text only faintly (4.55 on stone), so it is held to its documented role as the smallest, quietest text tier; anything meant to be read as body must step up to `--ink-2` or `--ink`.

### Named Rules
**The Never-Only-Color Rule.** Camp color is never the sole carrier of meaning. A row's allegiance and outcome are legible from at least three independent cues — the hand-drawn position glyph (shape), the fixed 1→5 row order, and the lane mini-map — because Radiant vs. Dire is a red/green pair that a colorblind visitor cannot separate. A win/loss row states its outcome as a *filled vs. hollow node* before it states it as green vs. red (`--radiant` 6–8% wash vs. `--dire` 6–8% wash, `color-mix` in oklab).

**The Aegis Rule.** Gold appears only on things you can act on or things that were won: primary buttons, focus rings, the caret, selection, the minute-scrub, active sort, copy-ID, the MVP marker, decisive fights, milestones, and the Roshan node. Its rarity is the point — a screen where everything is gold has communicated nothing. Secondary actions stay un-gilded (`.btn-ghost` is transparent with a hairline border).

**The Tinted-Ink Rule.** There are no neutral grays on colored water. Every ink is mixed from the river's hue, and `--ink-4` (#4a6b77, 2.37:1) is demoted out of the text ramp entirely: it may only ever be a stroke, a separator, or an icon line weight — never a `color:`.

## Typography

**Display Font:** PT Sans Narrow (fallbacks 'Arial Narrow', 'Helvetica Neue', sans-serif), loaded at 400 & 700.
**Body / UI Font:** Golos Text (fallbacks 'Segoe UI', system-ui, -apple-system, sans-serif), loaded as a 400–900 variable range.
**Label / Numeral Font:** the same PT Sans Narrow — there is deliberately **no third face**.

**Character:** two Cyrillic-complete families read against each other on width contrast. PT Sans Narrow is condensed like a broadcast result ticker and carries the display voice *and every statistic numeral*; Golos Text is the calm UI prose. A monospace (JetBrains Mono) and a popular condensed sans (Oswald) were both removed — tabular columns must align within the same family, and Oswald's "top-popular" ubiquity reads as every generic dashboard.

The type scale is modular 1.2 off a 15px body, with small steps added for dense tables: `--t-2xs` 11px · `--t-xs` 12.5px · `--t-sm` 14px · `--t-md` 15px · `--t-lg` 18px · `--t-xl` 22px · `--t-2xl` 27px · `--t-3xl` 34px · `--t-4xl` 44px · `--t-5xl` 62px · `--t-hero` 104px. Leading is `--lh-tight` 1.02 / `--lh-head` 1.12 / `--lh-body` 1.55 / `--lh-loose` 1.7.

### Hierarchy
- **Display** (700, `clamp(40px, 5.6vw, 104px)`, lh 1.02, –0.012em): the match outcome word (`--camp` colored) and the home/profile headline (`--t-4xl`→`--t-5xl`). Rare and huge.
- **Headline** (700, `--t-xl` 22px, lh 1.12): section titles (`.section-title`) and the spine readout title. Letter-spacing 0 — hierarchy is carried by size, weight, and air, never by letter-spacing or ALL-CAPS.
- **Title** (700, `--t-lg` 18px, lh 1.2): panel/insight-lead/side titles and the winning-hero art name.
- **Body** (400, `--t-md` 15px, lh 1.55): Golos prose, notes, descriptions. Keep prose measures near `62ch` (the insight lead caps at 62ch, row notes at 72ch).
- **Label** (500, `--t-xs` 12.5px, lh 1.3): table headers, section notes, chips. Not uppercase.
- **Stat numeral** (700, PT Sans Narrow, `font-variant-numeric: tabular-nums lining-nums`, `"tnum"/"lnum"`, +0.005em): the `.num` class and every KDA/gold/duration figure — always right-aligned and tabular so columns sum at the digit.

### Named Rules
**The One-Family-For-Numbers Rule.** Every statistic numeral is PT Sans Narrow with tabular figures; columns must line up by digit, not "roughly." A new number never introduces a mono font.

**The Don't-Shout-Rule.** Section labels and headings do not use letter-spacing-as-noise or `text-transform: uppercase`; the scale uses `letter-spacing: 0` on section titles and tags, and only tiny affordance labels (the 9px `--t-2xs` eyebrows, the `.spine-tab` 0.08em wordmark rail) earn tracking.

## Layout

The app is a single `flex` column: sticky `.topbar` (height `--topbar-h` 60px), a `.layout` main that flexes to 1, and a footer. Content is centered in `--shell` 1360px (the narrow home/profile rail uses `--shell-narrow` 1080px) with `margin: 0 auto` and `padding: var(--s-6) var(--s-5) var(--s-9)`. A fixed `.world-layer` (z-index -1) paints the river gradient and 4.5%-opacity grain once, so no block borrows the background for itself.

Spacing is an 8px rhythm (`--s-1` 4 → `--s-9` 96), with one doctrine stated in the tokens: *under a heading there is always less air than above it* (`.section { margin-top: var(--s-7) }` vs. `.section-head { margin-bottom: var(--s-4) }`). Grid children get `min-width: 0` everywhere (`.match > *`, `.rosters > *`) so tables and horizontal scrollers can't stretch the page sideways.

Match page: `.match` is a single-column grid at `--s-6` gap, stacking the hero plate, sticky `.subnav`, insights, the spine, charts, rosters, fights, timeline, draft. Two asymmetric grids define the plate: the hero is `minmax(240px,5fr) / minmax(0,7fr)` (art left, result right), and insights lead with one block plus a dense list (`1fr / 1.15fr`), never a row of identical cards.

Responsive behavior (measured):
- ≤1180px the profile overview collapses to one column and the aside stops sticking; ≥1181px home becomes a `1.55fr / .62fr` two-pane.
- ≤1080px hero plate folds to one column with the result ordered first (art `order: 2`), charts stack, insights stack.
- ≤980px the roster `<thead>` is dropped and each row becomes a 3-column card grid whose stat cells self-label from `data-label`.
- ≤900px the profile match-row folds to the `outcome / hero / kda+meter / econ+time` area map and the topbar nav hides.
- ≤700px teamfights lose rank/caret and drop metadata to a second line; the spine field shrinks to 132px, run heights rescale (`54px * --peak`), and the timeline axis hides.
- ≤720px layout padding tightens to `--s-4`; ≤520px the brand wordmark hides and avatar frames shrink to 60px.

## Elevation & Depth

Depth is **tonal, not cast**. The world reads as *bottom → surface* through the color ramp (riverbed → river → stone → stone-2) and hairline `--rule`/`--rule-2` "borders," most of which are `inset` box-shadows rather than painted edges. Surfaces are flat at rest. Only two structural shadows exist, and they appear in response to state and hierarchy: the hero plate and popover-like layers (recent-search dropdown, chart tooltip) get `--shadow-pop`; content panels carry a soft `--shadow` whose first layer is an inset top-light hairline. Glow is treated as an anomaly, not a tool — the one deliberate exception is documented below.

### Shadow Vocabulary
- **`--shadow-sm`** `0 1px 2px rgba(3,12,16,.5)`: minimal contact shadow.
- **`--shadow`** `0 1px 0 rgba(150,202,216,.06) inset, 0 12px 28px -18px rgba(3,12,16,.9)`: default panel lift — the inset top hairline reads as ambient, the long low-alpha drop reads as resting height.
- **`--shadow-pop`** `0 2px 4px rgba(3,12,16,.45), 0 28px 56px -24px rgba(3,12,16,.95)`: floating state only — hero plate, dropdowns, tooltips.
- **backdrop-blur** `blur(12px)` on the sticky `.subnav` (over an 88% stone) is the *only* translucency; the topbar and rails are opaque.

### Named Rules
**The Flat-By-Default Rule.** Surfaces sit at the tone that means their depth; shadows are answers to state, not decoration. A node is filled or hollow (`--radiant`/`--dire` fill vs. an inset hairline ring), never lit.

**The No-Glow Rule (with one exception).** Camp and gold color do not glow. The single measured exception is `.team-flag`, a 3px camp bar that carries `box-shadow: 0 0 14px -1px var(--team)`; new components should not extend this — depth stays tonal.

## Shapes

The form language is a ranked corner system, and ranking it is the point: **one radius per hierarchy tier, never a blanket corner.** `--r-node` 2px for axis nodes, icons and numerals · `--r-ctl` 5px for fields, buttons and chips · `--r-panel` 9px for panels and tables · `--r-plate` 16px for the hero scoreboard only (the largest corner in the system, sitting above panels → rows → nodes) · `--r-pill` 999px reserved for tracks and scales, explicitly *not* for cards. Corner radii in the code mirror the CSS tokens exactly (2/5/9/16/999px).

Beyond radius, the recurring geometry is Dota-native notation: the Roshan node is a gold diamond (`rotate(45deg)`, 9px, `--r-node`→1px sharp), teamfight nodes are circles (50%), structure/barracks nodes are sharp squares; the hero plate is an angular camp wedge (`linear-gradient(104deg …)`), the error notice is a horizontal camp wash (`linear-gradient(90deg, --dire-deep, --stone 42%)`), and item slots for neutral items use an asymmetric `50% 50% 50% 4px` leaf. Everything else keeps to the ranked tiers.

## Components

### Buttons
- **Shape:** control radius (5px, `--r-ctl`), fixed 38px tall, `padding: 0 16px`, 600 weight, `--t-sm` 14px.
- **Primary (`.btn`):** Aegis gold ground (`--aegis`), dark ink `#1b1405` (11.15:1), 16px stroke icons (`stroke-width: 1.9`, round joins). Hover brightens `filter: brightness(1.09)`; active sinks `translateY(1px)`; disabled drops to 45% opacity with `cursor: progress`.
- **Ghost (`.btn-ghost`):** transparent ground, `--ink-2` text, hairline `--rule-2` border, 500 weight — never gilded. Hover fills `--stone-2`, lifts text to `--ink`, and hardens the border to `--ink-4`.
- **Motion:** the *only* long choreography is the page's three-stage `stage-rise` entrance (200ms `--ease-out`, staggered 0/70/140ms, transform-only — never opacity, so content is never invisible); everything else responds at `--d-hit` 70ms so scanning data stays instant.

### Chips & Tags
- **Chip (`.chip`):** 26px tall, `--stone` ground, `--rule` hairline, `--t-xs` 12.5px `--ink-2`, `--r-ctl`; embedded `strong` jumps to `--ink` 600.
- **Tag (`.tag`):** flat 11px label on a 1px hairline, `--ink-3`, `--r-node`, +0.03em tracking — a quiet classification mark, not a button.
- **Tag-strong / milestone / MVP / fight-tag / decisive:** these are the *gold* variants, and by the Aegis Rule they mean actionable-or-won only.

### Cards / Containers
- **Corner:** panel radius (9px, `--r-panel`) for `.panel`; plate radius (16px, `--r-plate`) reserved for the hero and the team/roster block; `overflow: hidden` clips table headers to the corner.
- **Background:** `--stone` ground over the river world; team headers add a camp wash gradient (`--team-wash → transparent 60%`), and the hero plate uses the camp wedge.
- **Shadow:** reference the Elevation section — `--shadow` at rest, `--shadow-pop` when floating.
- **Border:** hairline `--rule` (`--rule-2` for stronger separators). Tables put camp allegiance on a `::before` rail (2px `--team`, gold when `.mvp`/open), not a full border.
- **Internal padding:** `--s-5`/`--s-4` panels, `--s-6` on the hero plate and verdict block.

### Inputs / Fields
- **Style:** `--r-ctl` corners, `--stone` ground for the header search (36px, 62px/36px padding) and `--riverbed` ground for the home gate field (60px, display-family numerals); placeholder in `--ink-2`.
- **Focus:** border shifts to `--aegis` and the ground lifts to `--stone-2`/`--stone`; the search glass icon strokes to gold. The native `:focus-visible` ring is a 2px `--aegis` outline with 2px offset.
- **Browser surfaces are themed:** caret is `--aegis`, `::selection` is gold on `#1b1405`, the scrollbar track is `--riverbed` with a `--stone-2` thumb (hover `#2a6273`).

### Navigation
- **Topbar:** sticky `--riverbed` bar; brand mark is two camp triangles (`.m-r` `--radiant`, `.m-d` `--dire`) that do a 700ms `mark-spin` on hover; links are `--ink-2`, hover/active `--ink`, and the active link grows a `--ink` underline via `scaleX`. Nav hides ≤900px.
- **Subnav tabs (match) / tabs (profile):** sticky under the topbar, horizontally scrollable, tab labels in PT Sans Narrow 500 14px with 0.08em tracking; hover/selected fill `--stone-2`, and the selected tab drops a 2px `--aegis` underline (`::after`) — the gold underline is the actionable/selected signal. Disabled tabs (no replay timeline) stay honest at 35% opacity.

### Signature: The PowerSpine (`.spine`)
The whole world's thesis in one component — a single full-width minute axis, not a chart in a card. Advantage runs render as camp blocks (`.run.r`/`.run.d`) whose **width equals the minutes the state held** and whose height is a square-root of the within-run peak (`--peak = √(peak/span)`, so a long small lead stays legible beside a late blowout) — `rgba` fills are used here because oklab `color-mix` against transparent muddied the camp color. Over the runs sits a thin `--ink-2` advantage line (`--spine-line-path`, 1.25px, `vector-effect: non-scaling-stroke`). Event nodes sit **above** the axis for Radiant and **below** for Dire; a node is filled or hollow with shape as its meaning (square tower, larger square barracks, gold diamond Roshan, circle teamfight), never glowing. Kills are deliberately excluded from the spine (their density would eat the sign-change the axis exists to show). The scrub is a **native `input[type=range]`** with a 2px full-height gold thumb: focusing/hovering a minute sets `.spine.focused`, which dims the field (`--run` opacity → .28, nodes → .3, Roshan held at .85) and pulls that minute's numbers into the title and `--spine-at` readout. The reduced-motion query flattens the staging and zeroes durations.

### Signature: Position Glyphs & Lane Map (non-color role cues)
- **`PositionIcon`** — hand-drawn inline SVG on a 24×24 grid, single stroke weight 1.8, `currentColor`, `role="img"` with an aria-label and a `<title>` stating provenance. Five distinct *silhouettes*: sword (1 carry), diagonal-with-two-dots (2 mid), shield (3 offlane), open-ring ward + one chevron (4 soft support), closed-ring ward + two chevrons (5 hard support). Chosen explicitly because the old SVGs differed only by a red/green flag — one shape to a colorblind eye. Glyph renders `--ink-2`, tinted to `--radiant`/`--dire` by team; an estimated (from-economy) position dims to `--ink-3` at 75%, and no glyph renders at all when there is no source.
- **`LaneMap`** — a mini-map schematic (field, river diagonal, three lanes, camp base dot), the lane the player held lit (`--ink`→camp `--on` stroke), sides mirrored for Dire. `jungle`/`roaming` are intentionally absent — see Drift.

## Do's and Don'ts

### Do:
- **Do** keep one dark world. `color-scheme: dark` on `:root`; there is no light override to add.
- **Do** treat camp color as *one* carrier among several: pair every Radiant/Dire signal with the position glyph, the fixed 1→5 order, and the lane map, and mark outcome with a filled-vs-hollow node before a hue.
- **Do** reserve `--aegis` for actionable or won states only (buttons, focus, caret, selection, the scrub, active sort, MVP, decisive fights, milestones, Roshan).
- **Do** place `--shard` blue only on scepter/shard item rings; it is the item's color, not the interface's.
- **Do** use the ranked radii by tier (`--r-node` 2 / `--r-ctl` 5 / `--r-panel` 9 / `--r-plate` 16 / `--r-pill` 999) and `--r-pill` on tracks/scales, never on cards.
- **Do** set every statistic numeral in PT Sans Narrow with `tabular-nums lining-nums` and right-align it.
- **Do** convey depth tonally (riverbed→river→stone→stone-2 + hairline rules); reach for `--shadow-pop` only on a floating surface.
- **Do** respect the contrast ledger: body text at `--ink`/`--ink-2`, captions at `--ink-3` (min), and small text on the darkest ground (`--ink-3` on `--river` = 5.60).
- **Do** keep hover feedback at `--d-hit` (70ms) and save the only long sequence for the three-stage page entrance.
- **Do** honor `prefers-reduced-motion`: it zeroes durations and flattens the staging.

### Don't:
- **Don't** use `--ink-4` (#4a6b77, 2.37:1) as text. Strokes, separators, and icon weights only.
- **Don't** glow. Filled-or-hollow beats lit; the `.team-flag` glow is the one legacy exception and should not spread.
- **Don't** introduce a third typeface or a mono for numbers, and **Don't** resurrect Oswald or JetBrains Mono (both were deliberately removed).
- **Don't** reach for neon, decorative grids, or an undifferentiated blanket corner — the surface is the calm, color is rationed.
- **Don't** fake data to fill the role system: render a position/lane glyph only where a real source exists, and dim it when inferred from economy (PRODUCT's "Provenance over polish", "absence is an answer").
- **Don't** split the source of truth: these names (`--river`, `--stone`, `--radiant`, `--aegis`, `--shard`, …) are the project's own and should not be renamed to generic design-system roles.

## Drift — direction contract vs. what shipped

Recorded from the code, flagging where the built reality departs from `.impeccable/surfaces/src-pages-matchpage-tsx.md`. The **code is authoritative**; the contract is a promise some of it didn't keep.

- **Ground hexes were retuned.** The contract's OWN-WORLD named the water `#123039`, the deepest field `#0b2229`, and the stone rails `#1b3d47`. The shipped tokens are `--river` **#12323c**, `--riverbed` **#0a1e26**, and `--stone` **#19414d**. Camp green `#4fd18b`, ember `#ef5f4f` and gold `#f0c46a` all match the contract exactly; the teal ground drifted slightly lighter/bluer on all three depth stops. Use the token values above, not the brief's.
- **Jungle was promised, then declined.** The contract's Data decisions stated "Lane **and jungle** are surfaced additively from `lane_pos` and `camps_stacked`." The code surfaced **lane only** (`safelane | mid | offlane`, populated in `server/gc/infer-replay-positions.mjs` and typed in `src/api/types.ts`), and `LaneMap.tsx` **deliberately excludes jungle and roaming** ("a made-up lane is worse than an empty one"). `camps_stacked` never became a jungle signal; it survives only as a tiebreaker that splits the off-lane duo. So the "additive jungle" clause of the contract is **not built**, and the PRODUCT.md note that "there is no lane field anywhere" is itself now stale against the shipped `lane?` type.
- **Tabs are not extent-proportional.** The contract's FIRST VIEWPORT asked for a "tabs rail, extent-proportional." The built `.subnav` / `.tabs` use fixed `padding: var(--s-3) var(--s-4)` content-width pills in a horizontally-scrollable strip; widths are uniform-by-content, not proportional to any data extent.
- **"Spine nodes filled-or-hollow, nothing labelled twice" — partially literal.** The filled-vs-hollow doctrine is real but lives in the profile match-row win/loss node (`--mr-outcome b::before`). On the PowerSpine itself, event nodes are all *filled* and differentiated by **shape** (square / sharp square / gold diamond / circle) plus camp + vertical position, since the Roshan diamond is intentionally gold. And the spine title does restate the focused minute ("Минута N · перевес …") alongside the scrub readout — a deliberate, useful label, not an accidental duplication.
- **Hero plate composition holds.** Art across the left half and the result set as an active, camp-colored element on the right (`.result-outcome { color: var(--camp) }`), folding to result-first on narrow screens — this matches the contract as built.
