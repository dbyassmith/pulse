# Goldfish

A personal date-tracking system that monitors upcoming events and surfaces confirmed dates. Goldfish watches for event announcements across the web, stores confirmed dates in Supabase, and displays them via a CLI, iOS app, and home screen widget.

## Components

### CLI (`cli/`)

A Node.js command-line tool for managing dates in the Supabase database.

```bash
cd cli && npm install && npm run build
npm link  # makes `goldfish` available globally
```

Key commands:

- `goldfish auth login` — authenticate with Supabase
- `goldfish date add --title "Event" --date 2026-06-09 --confidence high` — add a confirmed date
- `goldfish date list` — view upcoming dates

### Agent (`agent/`)

An automated monitoring system powered by Claude Code that watches for event date announcements. Driven by three slash commands:

- `/pls-watch` — add an event to the watchlist for ongoing monitoring
- `/pls-search` — one-shot search for a specific event date
- `/pls-run` — run the full workflow: search all watchlist items and requeue recurring events

Watchlist items live in `agent/watchlist/` and resolved items move to `agent/resolved/confirmed/`.

### iOS App (`ios/goldfish/`)

A SwiftUI app with a home screen widget that displays upcoming confirmed dates. Connects to the same Supabase backend.

### Backend (`backend/`)

An Express server exposing `/chat` (authenticated conversational agent) and `/cron/run-watchlist` (server-side watchlist sweep). Runs from the included `Dockerfile`.

#### Watchlist cron

`.github/workflows/watchlist-cron.yml` triggers the sweep once a day at 09:00 UTC (and on manual `workflow_dispatch`). It POSTs to `${BACKEND_URL}/cron/run-watchlist` with a shared secret. The sweep walks every active `watchlist_items` row, calls the Brave + Claude date search primitive for each, and promotes confirmed matches into `confirmed_dates`.

Required repository settings for the workflow:

- **Secret** `CRON_SECRET` — must match `CRON_SECRET` on the backend (32+ characters).
- **Variable** `BACKEND_URL` — origin of the deployed backend, no trailing slash.

Manual run: GitHub → Actions → "Watchlist Cron" → Run workflow. The response JSON summary is printed in the run log.

To trigger locally:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/cron/run-watchlist
```

## Setup

1. Create a Supabase project and configure your dates table
2. Copy `ios/goldfish/Secrets.xcconfig.example` to `ios/goldfish/Secrets.xcconfig` and add your Supabase URL and anon key
3. For the CLI, configure credentials via `goldfish auth login`
