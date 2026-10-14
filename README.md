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
