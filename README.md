# Match Insights

Dota 2 match explorer with Valve match data and replay-derived purchase timelines.

## Local development

```sh
npm ci
npm run dev
```

Set `STEAM_WEB_API_KEY` in `.env` for the local API. Replay timelines use the
open-source OpenDota parser.

## Automated replay parsing

The scheduled GitHub Actions workflow checks cached player histories, parses
up to five ready replays per run, and uploads timelines to the Worker. Configure
repository Actions secrets `REPLAY_INGEST_URL` and `REPLAY_INGEST_TOKEN`.
