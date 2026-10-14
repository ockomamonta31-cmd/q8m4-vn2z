---
name: Dota Match Lab
description: A self-hosted Dota 2 match explainer on slate ground, Forum serif and volumetric role icons.
colors:
  bg: "#16222B"
  bg-deep: "#101A21"
  surface: "#1E2D38"
  surface-2: "#273845"
  line: "#36495A"
  text: "#ECE6D6"
  text-dim: "#98A9B6"
  radiant: "#86C25A"
  radiant-d: "#3E6B2A"
  dire: "#E0533F"
  dire-d: "#7A2A20"
  gold: "#D1A646"
typography:
  display:
    fontFamily: "'Forum', Georgia, 'Times New Roman', serif"
    fontWeight: 400
    lineHeight: 1.05
  ui:
    fontFamily: "'Onest', 'Geologica', system-ui, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
  numerals:
    fontFamily: "'Onest'"
    fontFeature: '"tnum" 1'
scale:
  type: [12, 14, 16, 20, 28, 44, 72, 120]
  space: [4, 8, 12, 16, 24, 32, 48, 64, 96]
  radius: { chip: 2, panel: 6, hero: 0 }
---

## Overview

One dark world on deep blue-grey slate. The page is flat `--bg` with 5% SVG grain
and a radial vignette to `--bg-deep`; there is no gradient wash and no second
background. Layering is done with three surface tones and hairline `--line`
rules, never with nested panels.

The page is *operational*: a player arrives with a match ID and wants the
explanation, not a mood. Restraint everywhere except two authored moments — the
match hero and the volumetric role icons.

**Font pairing.** Forum (Cyrillic serif, 400) carries every headline, the match
outcome and the profile winrate. Onest (Cyrillic variable sans) carries all UI
text and every statistic numeral, with `tabular-nums`. Geologica is the numeral
fallback only. Both faces are self-hosted from `public/fonts/` as latin +
cyrillic + cyrillic-ext subsets — no third-party request at runtime.

**Banned by the brief:** Inter/Roboto/Arial as the primary voice, mono for
labels, text under 12px, purple-blue gradients, glow, glassmorphism, blanket
radius, equal-card grids, panel-in-panel, ALL-CAPS tracked eyebrows, 01/02/03
markers, `→` in controls, gradient text, one word of a heading painted a
different colour, emoji.

## Colors

`--bg #16222B` is the page; `--bg-deep #101A21` is reserved for chrome (header,
tab rail, footer, expanded detail wells) and the vignette; `--surface
#1E2D38` is a row or panel; `--surface-2 #273845` is hover and inset track.
`--line #36495A` is the only separator. Ink is warm bone `#ECE6D6`, secondary is
`#98A9B6` — never pure white or grey.

Camp colour is data, never decoration: `--radiant` / `--dire` with their dark
partners for heatmap ramps. `--gold` is rationed to things you can act on or
that were won — the primary button, focus ring, caret, selection, MVP, the
best-in-category dot, the networth delta, key-moment markers, the active tab
underline.

Role icons carry STRATZ's own gradient colours and are the only place those
hues appear. Team allegiance is carried by the row strip and the portrait
frame, so a role colour never doubles as camp colour.

**The tinted-numerals rule.** `--dire` at #E0533F on `--surface` measures 3.7:1
and fails WCAG AA for body-size text. Where a red or green number *is* text, it
uses `--dire-t` / `--radiant-t` — the same token mixed 20–26% toward bone.
Charts, bars and strips keep the pure token. This is a contrast fix, not a
sixth accent.

## Typography

Forum is never bolded (it has no bold); hierarchy comes from size and air.
Scale is exactly 12 / 14 / 16 / 20 / 28 / 44 / 72 / 120px, leading 1.5 for text
and 1.05 for headings. The 120px step appears twice: the match outcome and the
profile winrate. Body is 14–16px; nothing on the page is smaller than 12px.

All numerals are Onest with `font-variant-numeric: tabular-nums` set on `body`,
so columns align by digit without a third face.

## Layout

Container is 1280px with 24px side padding (16px on mobile). The match hero and
the tab rail break out to full viewport width; everything else stays in the
container.

Match page: full-bleed hero → sticky 48px tab rail → sections separated by
`--line` and 48px of air. No card wraps a section. Player page: a sticky 340px
left column and a fluid right column. Home: headline and search on the left, a
vertical strip of three darkened hero renders on the right.

Spacing uses only 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96.

## Elevation & Depth

Depth is tonal. Exactly one shadow exists — `0 8px 24px rgba(0,0,0,.45)` — and
it is reserved for floating layers: tooltips, the search dropdown. Everything
else sits at the surface tone that means its depth. Hairline separation is
`box-shadow: inset 0 0 0 1px var(--line)`, which is a border, not a shadow.

## Shapes

Two radii: 2px for chips, badges, buttons and item slots; 6px for panels, rows
and portraits. Hero, header, rails and the footer are square (0). Circles are
reserved for dot separators and the best-in-category marker.

## Components

**Edik.** The default view shows at most three distinct, important decision
episodes, immediately from replay evidence. Each row has a time, a short
consequence and one concrete correction. Supporting facts live in native
`details`; the full lane, fight and map measurements are collapsed beneath
«Все эпизоды и измерения». Routine purchases and role plans do not fill error
slots. An isolated gank is prioritized over small trading windows; unknown
visibility is never stated as observed. No model generation blocks this view.

**Hero (match).** 560px desktop / 420px mobile, full width, no radius. The
winning camp's highest-impact hero is Valve's 1440px render, anchored bottom
right, dissolving into `--bg` through two scrims. Outcome is Forum 120px in
bone with a 4×96px camp rule beneath it and a 6px camp strip on the bottom edge.
Kills are 72px (winner bone, loser dimmed); duration and networth delta are
28px, the delta in gold. Metadata is one 14px line separated by SVG dots, not
middle-dot characters.

**Tab rail.** Sticky under the header, 48px, `--bg-deep`. Active tab is bone text
with a 3px gold underline; inactive is `--text-dim`. No pills, no backgrounds,
no transition on switch.

**Role icons.** The original STRATZ position glyphs, downloaded from their match
page and served from `public/assets/roles/role-1.svg … role-5.svg` (sword, bow,
shield-with-bolt, hand-with-flame, hand-with-sparks) plus `lane-safe/-mid/-off.svg`.
Rendered as plain `<img>` — no base, no frame, no shield, no shadow, no recolouring.
48px in Противостояние, 40px in tables and rows, 24px in chips; the 16px lane badge
sits on the bottom-right corner. No position data → no icon; estimated position
dims to 62%. Russian tooltips stay in `title`/`alt`.

**Player table.** Exactly eight columns: player, impact, K/D/A, networth,
GPM/XPM, LH/DN, damage, items. 64px rows, `--surface`, hover `--surface-2`, a
3px camp strip at the left, radius only on the first and last row of a block.
Towers, healing, backpack, Aghanims, ability and purchase order live in the
expansion. The word "разбор" is gone.

**Противостояние.** Two fives face each other, ordered position 1→5: portrait
with a 3px camp strip on top, signed impact with a mini-bar, 40px role icon.
Tiles/list toggle in the corner.

**Buttons.** Primary is gold ground on `--bg-deep` ink, 40px tall, 2px radius.
Secondary is a hairline `--line` outline. Focus is a 2px gold outline at 2px
offset on every control.

**States.** Loading is a `--surface` skeleton pulsing opacity only, 1.4s. Errors
name the problem and the recovery in Russian with a "Повторить" button. Missing
data hides its section.

## Motion

One authored entrance per page: the hero text slides in from the left at 300ms
ease-out and player rows rise in a 50ms stagger. Counters run only on score,
duration and winrate (600ms). Everything else is a 120ms hover or a 100ms
tooltip. Only `transform` and `opacity` animate; `prefers-reduced-motion`
disables all of it.

## Drift — brief vs. what shipped

- **Per-player networth curves (brief 3.7) are not built.** The served timeline
  carries only the aggregate advantage series; the raw replay has `gold_t` /
  `networth_t` per player, but surfacing them means changing normalisation and
  the API, which the brief puts out of scope. Networth across ten players is
  shown as horizontal team-coloured bars instead.
- **Draft order is not chronological in Valve's data.** `picks_bans` arrives
  grouped (all picks first, then all bans), so the UI never shows a global
  "pick N" sequence: `draftView()` puts bans in an «Автобаны» block and cuts
  the picks into phases of at most two heroes per team. When the pick order runs
  team-by-team (Turbo), the block is one «Выбор» group instead of five phases
  with empty halves.
- **Steam Web API returns a broken draft; STRATZ completes it.** On match
  8707790624 the Web API reports 6 bans and 11 "picks" — one of them a hero
  nobody played, because Valve mislabels part of the auto-ban list — while
  STRATZ's GC-derived record shows 17 bans and exactly 10 picks. `/api/matches/:id`
  therefore merges `draft` (full ban list + picks) and per-player `lane` /
  `position` from STRATZ, and only accepts the draft when its ten picks are
  exactly the ten heroes played. Bans in All Draft are simultaneous and
  unattributed in both sources, so they render as one list, not per team.
  Without a STRATZ record the Steam answer is repaired locally (phantom picks
  become bans, unlisted picks are recovered from the lineup) and the block says
  how complete it is.
- **The «Драфт» tab needs a draft**, i.e. bans or at least one recorded pick;
  «Билды» is disabled with an explanation when no player has ability-upgrade
  records.
- **Lane badge covers safe / mid / off only.** STRATZ's own bundle also has
  `Roaming` and `Jungle` lane glyphs, but neither our parser nor the STRATZ
  `lane` field distinguishes them, so those two are not shipped.
- **Role coverage is now near-total, but from two sources.** `positionSource`
  is `replay` for matches we parsed ourselves, `stratz` for the rest (their
  replay parse), and `stats` never — an estimate from economy was judged too
  easy to mistake for a fact. The tooltip says which one it is.
- **Exactly two ratings, both computed by us.** A lane is a corridor of the map,
  so lanes are mirrored: mid against mid, and carry plus its support against the
  enemy offlaner (our pos 1/5 vs their pos 3/4) — never «safe vs safe». On top of
  the three lane verdicts there is one overall draft rating per team.
  Both come from `server/data/constants/hero_profile.json`, built by
  `npm run profile:build` out of **our own** match library (996 games of raw Valve
  stats): every hero is compared with the average of **his own role** (role = farm
  order inside the team, so a support is never scored as a weak carry), an index
  of 1.00 means «does the job of an average hero on that role». Six axes (farm,
  fight, pressure, support, tempo, pair synergy) each become a strength share,
  and the total is their mean. No third-party winrates are used anywhere in the
  rating; the STRATZ merge above is only match facts (bans, picks, lanes), never
  an evaluation.
- **A lane is the first ~10 minutes, and only a parsed replay can say how it
  ended.** `impactPhases[0]` («Начало · 0–10 мин», shared helper
  `server/gc/impact-phases.mjs`, used by both the API and the backtest) gives
  last hits, XP and gold for that window. Profile and match use the same five
  outcomes: stomp / win / draw / loss / stomp loss. Initial groups come from
  alive movement at 1–5 minutes (lane heatmap fallback); uncertain membership
  or an incomplete ten-minute window gives no verdict. The resource edge is
  65% earned gold + 35% XP, each relative to the mean of both lane groups:
  below 10% is a draw, from 10% a win, from 30% a stomp only if both gold and
  XP lead by at least 10%. Supports share their lane result. Subsequent
  rotations and jungle income remain part of the initial group’s resources. Whole-match numbers are still shown, but
  inside a collapsed block labelled as *not* a lane result, and a match without
  a parsed replay says plainly «реплей не разобран — чем закончилась именно
  линия, не измерено» instead of inventing a winner from final stats.
- **Lane predictions are not calibrated yet.** Only 21 lanes in the library have
  parsed first minutes (19 decisive). The UI quotes that number and refuses to
  call 84% on 19 lanes a conclusion; match-level calibration (998 games) is the
  one the overall verdict leans on.
- **The win probability is calibrated on our own library, not invented.**
  `npm run draft:backtest` runs the same `evaluateDraft()` (bundled by esbuild so
  it cannot drift from the frontend) over every cached match and writes
  `backtest` into `hero_profile.json`: 61.1% of match winners called correctly
  over 998 games, 57.2% of lanes over 2128, plus a calibration table of strength
  share → observed win rate. The UI quotes that table instead of a made-up
  mapping.
- **Synergy needs sample.** A pair counts only if it played together ≥12 times in
  our library; expected winrate is the mean of the two heroes' own winrates (not
  the union — that made every lift negative). If a side has fewer than two known
  pairs, the axis is dropped from the mean instead of being zeroed.
- **The detector flags five "side-tab" strips.** All five are mandated by the
  brief (tab underline, portrait camp strip, row outcome strip); they encode
  data, not decoration, and the brief overrides the skill.
