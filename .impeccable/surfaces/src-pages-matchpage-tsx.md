---
version: 1
slug: "src-pages-matchpage-tsx"
primary_target: "src/pages/MatchPage.tsx"
related_targets: []
---

# Surface brief — /match/:id

## Visitor mode

Operate for every data region; Experience for the hero plate only, as the brief pins it.

## Direction contract

THESIS: The match is a set of power thresholds. Every unlock, tower, Roshan and teamfight is a node on one shared minute axis, and the two camps are the two branches of that axis. Refuses the category default of a score banner over a row of identical insight cards.

OWN-WORLD: River-water teal ground (#123039) with the deepest field at #0b2229, stone rails at #1b3d47; Radiant moss #4fd18b and Dire ember #ef5f4f carry camp meaning and never decoration; Aegis gold #f0c46a only where something can be done or won. Nodes are filled or hollow, never glowing. Condensed tabular numerals on a hairline minute spine; nothing labelled twice.

STORY: The visitor sees in seconds which minute the game left them, whose power arrived late, and which camp held the advantage for how long — bar length equals the minutes a state actually held.

FIRST VIEWPORT: Full-bleed hero plate — darkened art of the winning camp's highest-impact hero across the left half, result typography set as an active element at the right with score and duration subordinate to it, and beneath it at full width the minute spine with camp nodes above and below. Signature interaction: hovering or focusing a minute column pulls that column's numbers into focus and drops the rest of the field to a faint bar pattern. Tabs rail below, extent-proportional.

FORM: Candidate 6 of seven grounded directions (post-game scoreboard, minimap notation, caster advantage graph, shop build order, loading-screen hero art, ability and talent sheet, Roshan timer ritual), assigned by roll. Seed key fcbdb631.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Data decisions

- Lane and jungle are surfaced additively from `lane_pos` and `camps_stacked`, which already exist in `server/data/replays/*.json`. Existing routes, requests and deploy are untouched.
- Position, lane and their provenance render only where the data really exists; absent means absent.


## Analysis extension — lanes, draft, Edik (2026-10-14)

Scope: existing match-page analysis, inheriting the current DESIGN.md and rendered identity. Hero, navigation and unrelated surfaces are preserved.

THESIS: Separate what the lineup promised from what players actually earned; an explanation must point to a measured minute or event.
OWN-WORLD: Incumbent slate surfaces, Forum headings, Onest body, Radiant green, Dire red, gold for current selection and review actions. Flat sections and open tables, no nested cards.
STORY: Identify each physical lane, read named team totals at 10:00, then select a player and a specific fight to review facts, routes and conditional advice.
FIRST VIEWPORT: The existing match hero stays. Within the draft panel the verdict leads, historical detail folds away, and each lane leads with its measured outcome. Within Edik the player and time-range controls precede concrete events.
FORM: Local extension of the existing match surface; no replacement world or new concept roll. Draft and lanes use progressive disclosure; Edik exposes one player and one time window at a time.
FINISH: Review desktop and 390px screenshots and working selectors, retain the incumbent design files, and verify the production deployment. New explanatory content must distinguish observation from a hypothesis about a mistake.
