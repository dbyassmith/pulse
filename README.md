# Pulse

A personal date-tracking system that monitors upcoming events and surfaces confirmed dates. Pulse watches for event announcements across the web, stores confirmed dates in Supabase, and displays them via a CLI, iOS app, and home screen widget.

## Components

### CLI (`cli/`)

A Node.js command-line tool for managing dates in the Supabase database.

```bash
cd cli && npm install && npm run build
npm link  # makes `pulse` available globally
```

Key commands:

- `pulse auth login` — authenticate with Supabase
- `pulse date add --title "Event" --date 2026-06-09 --confidence high` — add a confirmed date
- `pulse date list` — view upcoming dates

### Agent (`agent/`)

An automated monitoring system powered by Claude Code that watches for event date announcements. Driven by three slash commands:

- `/pls-watch` — add an event to the watchlist for ongoing monitoring
- `/pls-search` — one-shot search for a specific event date
- `/pls-run` — run the full workflow: search all watchlist items and requeue recurring events

Watchlist items live in `agent/watchlist/` and resolved items move to `agent/resolved/confirmed/`.

### iOS App (`ios/pulse/`)

A SwiftUI app with a home screen widget that displays upcoming confirmed dates. Connects to the same Supabase backend.

## Setup

1. Create a Supabase project and configure your dates table
2. Copy `ios/pulse/Secrets.xcconfig.example` to `ios/pulse/Secrets.xcconfig` and add your Supabase URL and anon key
3. For the CLI, configure credentials via `pulse auth login`
