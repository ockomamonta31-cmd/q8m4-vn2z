# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dota 2 players who have just finished a match they care about, and the same people in an
analyst role when they study a match that is not theirs. They arrive with a match ID or a
link pasted from chat, usually still in the emotion of the game, and want one thing
explained: why this match went the way it did. Secondary audience: the owner of the
deployment, who reads the same screens as a self-hosted tool and expects the data to be
theirs, not rented from a third party.

## Product Purpose

Dota Match Lab takes a single match and turns it into an explanation. It does not aggregate
leaderboards or track MMR; it answers "who carried, who fell below their line, what swung
the game, and in which minute". Success is a visitor reaching the turning point of the match
without reading a wall of raw stats.

## Positioning

The pipeline is first-party and self-hosted. Match data comes from the Valve Steam Web API,
replay-derived timelines are parsed on infrastructure the owner runs (an OpenDota parser in
Docker plus scheduled ingestion), and everything is cached server-side. The per-player impact
score of −100…+100 is a local model benchmarked against the typical stat line for a player's
position and win-rate bucket. STRATZ's closed IMP score is used only as an external reference
the local model is correlated against — it is not a runtime dependency, and the site has no
STRATZ GraphQL calls. A neighbouring product cannot copy this without copying the data
ownership.

## Operating Context

- Entry is a search box that accepts a match ID, a Steam32/Steam64 ID, or a link from
  stratz, dotabuff, OpenDota or Steam.
- Steam OpenID sign-in unlocks the visitor's own profile page and their friends' profiles.
- Match pages are read from a cache because a finished match never changes; replayed
  timelines arrive later than the match itself, so parts of the page are conditionally
  unavailable rather than empty.
- Scheduled GitHub Actions runs parse queued replays and upload timelines to the Worker.

## Capabilities and Constraints

- Three routes: `/` search, `/player/:id` profile, `/match/:id` match analysis. This is the
  whole surface area.
- Match page is tabbed: Обзор, Игроки, Графики, Таймлайн, Драфт. The Графики and Таймлайн
  tabs are disabled when no replay timeline exists; Драфт is disabled with no picks/bans.
  The redesign must keep that conditional availability honest.
- Player positions 1–5 come from replay lanes when a replay has been parsed. Without one
  they are estimated from match economy and are explicitly marked as an estimate. Nothing may
  be presented as known when it is inferred, and absent data is hidden rather than guessed.
- **Position and lane data is far scarcer than the redesign brief assumes.** Verified against
  the code and the cache: the player contract carries only `position: number` (0 = unknown)
  and `positionSource?: 'replay' | 'stats'` (`src/api/types.ts:29,31,140,142`). There is no
  `role` field and no `lane` field anywhere in the player data, in the local API, or in the
  Worker. `core`/`support` survives only as the account-level `Profile.rankIsCore`, which
  `server/index.mjs:533` hardcodes to `null`, so it is never populated in production. The one
  real lane enum in the codebase (`'top' | 'mid' | 'bot'`) belongs to towers and barracks in
  the timeline, not to players.
- Coverage is the harder limit: positions are not stored with the match, they are overlaid
  per request from `server/data/replays/`. Of 907 cached matches, 0 carry a position in their
  own JSON and only 7 have a parsed replay, so a position exists for roughly 0.8% of the
  library. The redesign must not present a position system that is empty on almost every
  match, and must not invent lane or role values to fill it.
- A lane is partially recoverable from position when `positionSource === 'replay'`, because
  `server/gc/infer-replay-positions.mjs` assigns positions *from* lane detection (safe lane →
  1 and 5, off lane → 3 and 4, mid → 2). `jungle` and `roaming` are never distinguished: the
  off-lane pair is treated as one undifferentiated group. Raw `lane_pos` coordinate
  histograms and `camps_stacked` do exist in the replay cache and could support a real lane
  and jungle signal, but exposing them means changing replay parsing and the API.
- Data is served only through the site's own `/api/*`. Routes, fetch logic, the impact model,
  replay parsing and deployment are out of scope for the redesign and must not change.
- Hosting is Cloudflare Workers with a D1 cache; the frontend builds to static assets with
  Vite. Styling is hand-written CSS with a token layer — no utility framework, no component
  library, no icon package.
- Interface language is Russian throughout, including hero and item names coming from Valve.

## Brand Commitments

- Name: Dota Match Lab. The footer's claim that the source is the Steam Web API and parsed
  replays, with scores from a local model, is factual and stays accurate.
- The product opens with the position that win rate explains nothing; contribution, relative
  performance and the time axis are the promised answer.

## Evidence on Hand

- Cached match JSON under `server/data/matches/`, player histories under
  `server/data/history/`, friends under `server/data/friends/`.
- Valve constant dumps: `server/data/constants/heroes.json`, `items.json`,
  `ability_lookup.json`, `hero_skill_order.json`.
- Local impact model and its calibration metadata: `src/api/impact-model.json`,
  `src/api/imp-model.json` (including its measured correlation with STRATZ IMP).
- Real replay timelines including teamfights, structures, kills and Roshan events, used by
  the charts and the timeline tab.
- A hero portrait and item icon stream served from the site's own API.
- Existing position glyphs at `public/positions/position-1..5.svg`, currently loaded as
  `<img>` files rather than inline SVG.
- No design documentation existed before this record. No DESIGN.md, no Figma, no brand
  guidelines, no screenshots baseline.

## Product Principles

1. Explain, do not display. A number earns its place by answering a question about the
   outcome, otherwise it belongs in an expansion.
2. Provenance over polish. Every derived value states whether it is measured, inferred or
   estimated, and never dresses an estimate as a fact.
3. Own the data chain. The product's credibility rests on being first-party; the interface
   should make that visible rather than hide the plumbing.
4. Absence is an answer. Missing replays, private profiles and unlisted matches are explained
   with what to do next, not blanked out or faked.
5. One match at a time. Depth on a single game beats breadth across many; the unit of value is
   the turning point of one match.

## Accessibility & Inclusion

WCAG AA contrast is required, keyboard focus must stay visible, `prefers-reduced-motion` must
be honoured, and the layout must hold at 390px without horizontal scrolling. Icon-only
signals — the position and lane system in particular — must remain legible at small sizes and
must never be the only carrier of meaning, because position is a load-bearing fact on this
page.

## Explicitly Undecided

- Whether a light theme ships: decided against. The code carried a full `data-theme="light"`
  token override, and the owner chose to remove it rather than maintain two worlds, so the
  product ships one dark Dota-world surface.
- Scope of the redesign: decided. All three routes are redesigned as their own screens, with
  the match page carrying the single boldest moment.
