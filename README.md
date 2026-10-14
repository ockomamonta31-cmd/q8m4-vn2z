# Match Insights

Dota 2 match explorer with Valve match data and replay-derived purchase timelines.

## Local development

```sh
npm ci
npm run dev
```

Set `STEAM_WEB_API_KEY` in `.env` for the local API. Replay timelines use the
open-source OpenDota parser.

Public player medals are enriched from OpenDota on both the local API and
Cloudflare Worker. Match snapshots batch the ten players; profile lookups fill
gaps. Ranks are cached separately for 24 hours, missing ranks for one hour;
provider failures retain a previous rank for at most seven days. The API returns
`rankSource`, `rankScope` and `rankFetchedAt`. Current medals are explicitly
distinguished from historical match ranks, and unavailable ranks stay unknown.
The Worker queues missing/stale ranks for the `Public player ranks` GitHub job,
which also responds to the existing Cloudflare cron dispatch. This avoids relying
on OpenDota availability from Cloudflare's shared egress. The job observes API
limits and writes only through the authenticated rank ingest endpoint.

Impact uses separate sign-constrained models for positions 1–5 and pub baselines
conditioned on hero, medal and duration. Outcome prediction metrics do not prove
causal individual contribution. Replay movement, team comeback and unobserved
support events are not assigned invented bonuses.

```sh
node scripts/train-impact.mjs
node scripts/check-impact.mjs
node scripts/check-ranks.mjs
```

## Automated replay parsing

The scheduled GitHub Actions workflow checks cached player histories, parses
up to five ready replays per run, and uploads timelines to the Worker. Configure
repository Actions secrets `REPLAY_INGEST_URL` and `REPLAY_INGEST_TOKEN`.

The match page polls `/api/matches/:id/replay-status` every 30 seconds while
replay details are incomplete, then refreshes both player evidence and the
timeline. Status distinguishes queued work, missing replay metadata, active
parsing and a failed attempt. Runner errors fail the Actions job; missing
metadata alone is normal waiting. Directly cached matches also enter the queue.
Replay uploads retain busy Invoker cast logs and accept up to 1.9 MB of UTF-8
JSON, keeping stored rows under D1's 2 MB ceiling.

```sh
node scripts/check-replay-ingest.mjs
```
