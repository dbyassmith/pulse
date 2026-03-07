---
title: "feat: Build Pulse CLI with auth and date submission"
type: feat
status: completed
date: 2026-03-06
---

# Build Pulse CLI

## Overview

A TypeScript Node.js CLI called `pulse` that authenticates users against Supabase email auth and submits date records to a `confirmed_dates` table. The CLI is **write-only** — reading dates back is handled by a separate iOS app.

Two command groups:

- `pulse auth` — login, logout, whoami
- `pulse date` — add, add-batch

## Table Schema

```sql
confirmed_dates (
  id text,
  user_id uuid references auth.users(id) not null,
  title text not null,
  date date not null,
  confidence text check (confidence in ('high', 'medium', 'low')) not null,
  source text,
  notes text,
  confirmed_at timestamptz default now(),
  group_id text,
  group_index int,
  primary key (id, user_id)
)
```

Key details:
- Composite primary key `(id, user_id)` — the CLI must generate `id` values (client-generated text IDs)
- `user_id` is always injected from the authenticated session, never accepted as input
- `confidence` is an enum-like check constraint: `high`, `medium`, `low`
- `group_id` and `group_index` support batch grouping (used by `add-batch`)

## Command Reference

### `pulse auth login`

Interactive email/password authentication.

- Prompts for email (plain text input)
- Prompts for password (masked input)
- Calls `supabase.auth.signInWithPassword({ email, password })`
- Persists session (access_token, refresh_token, expires_at, user metadata) to `~/.pulse/session.json` with `0600` permissions
- Prints: `Logged in as <email>`
- Exit 1 on invalid credentials with clear error message

### `pulse auth logout`

- Calls `supabase.auth.signOut()` to invalidate server-side
- Deletes `~/.pulse/session.json`
- Prints: `Logged out`
- If no session exists, prints: `Not logged in` (exit 0, not an error)

### `pulse auth whoami`

- Reads persisted session, refreshes if expired
- Prints: email and user ID
- If no session / refresh fails: `Not logged in. Run: pulse auth login` (exit 1)

### `pulse date add`

Add a single confirmed date.

```
pulse date add --title "Launch day" --date 2026-03-15 --confidence high [--source "email"] [--notes "CEO confirmed"]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--title <text>` | Yes | Title of the date entry |
| `--date <YYYY-MM-DD>` | Yes | The date value |
| `--confidence <level>` | Yes | `high`, `medium`, or `low` |
| `--source <text>` | No | Where this date came from |
| `--notes <text>` | No | Additional notes |
| `--id <text>` | No | Custom ID (auto-generated UUID if omitted) |

Behavior:
- Validates date format (YYYY-MM-DD) client-side
- Validates confidence is one of the three allowed values
- Generates a UUID for `id` if not provided
- Injects `user_id` from session
- Inserts into `confirmed_dates` via Supabase client
- Prints: `Added: <id>` on success

### `pulse date add-batch --file <path>`

Add multiple confirmed dates from a JSON file.

```
pulse date add-batch --file dates.json
```

**JSON file format:**

```json
[
  {
    "title": "Launch day",
    "date": "2026-03-15",
    "confidence": "high",
    "source": "email",
    "notes": "CEO confirmed"
  },
  {
    "title": "Board meeting",
    "date": "2026-03-20",
    "confidence": "medium"
  }
]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--file <path>` | Yes | Path to JSON file containing date entries |
| `--group-id <text>` | No | Shared group_id for all entries (auto-generated if omitted) |

Behavior:
- Reads and parses the JSON file
- Validates each entry (same rules as `add`)
- Generates `id` for each entry, assigns `group_id` and sequential `group_index`
- Injects `user_id` from session into every row
- Uses Supabase batch insert (single `.insert()` call with array)
- **Best-effort**: reports successes and failures individually
- Prints: `Added <N> dates (group: <group_id>)` or `Added <N>/<total>, <M> failed` with error details

## Technical Approach

### Project Structure

```
pulse/
  src/
    index.ts              # Entry point: program definition + parseAsync
    commands/
      auth.ts             # auth command group (login, logout, whoami)
      date.ts             # date command group (add, add-batch)
    lib/
      supabase.ts         # Supabase client factory with custom storage adapter
      session.ts          # Session persistence (read/write/delete ~/.pulse/session.json)
      config.ts           # Environment variable validation
  package.json
  tsconfig.json
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `commander` | CLI framework |
| `@supabase/supabase-js` | Supabase client (auth + DB) |
| `@inquirer/prompts` | Interactive password/email prompts |
| `uuid` | Generate IDs for date entries |

Dev dependencies: `typescript`, `tsx`, `@types/node`, `@types/uuid`

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |

Validated at startup in `config.ts`. CLI exits with a clear error if either is missing.

### Session Persistence

The Supabase JS client expects a storage adapter (localStorage-like interface) for session management. For a CLI context:

1. **Custom storage adapter** in `session.ts` implementing `getItem`, `setItem`, `removeItem` backed by `~/.pulse/session.json`
2. File is created with `0600` permissions (owner read/write only)
3. The Supabase client is initialized with this custom storage, enabling its built-in token refresh to work automatically
4. On every command that requires auth, the client is created with the persisted storage — Supabase handles reading the session and refreshing expired tokens internally

```
// Pseudocode for the storage adapter
class FileStorage {
  getItem(key): reads from ~/.pulse/session.json[key]
  setItem(key, value): writes to ~/.pulse/session.json[key], chmod 0600
  removeItem(key): deletes key from ~/.pulse/session.json
}
```

### Auth Guard

A `preAction` hook on the `date` command group that:
1. Attempts to get the current session via `supabase.auth.getSession()`
2. If no session or refresh fails, prints error and exits
3. Extracts `user_id` from `session.user.id` for use in date commands

This ensures every `date` subcommand has a valid, fresh session without duplicating auth logic.

### Token Refresh Strategy

- **Proactive**: Supabase JS client automatically refreshes tokens when `getSession()` is called and the access token is expired but the refresh token is valid
- The custom storage adapter ensures refreshed tokens are written back to disk
- If both tokens are expired, the user gets: `Session expired. Run: pulse auth login`

## Acceptance Criteria

- [x] `pulse auth login` prompts for email/password, authenticates, persists session
- [x] `pulse auth logout` clears local session and invalidates server-side
- [x] `pulse auth whoami` displays current user email and ID
- [x] `pulse date add` inserts a single record with all required fields
- [x] `pulse date add-batch --file` inserts multiple records from JSON with group tracking
- [x] `user_id` is never accepted as CLI input — always from session
- [x] Token refresh works transparently (login once, commands work until refresh token expires)
- [x] Missing `SUPABASE_URL` or `SUPABASE_ANON_KEY` produces a clear error
- [x] Invalid date format or confidence value is rejected client-side
- [x] Session file has `0600` permissions
- [x] CLI can be installed globally via `npm install -g` and run as `pulse`

## Implementation Phases

### Phase 1: Project Scaffold
- Initialize npm project with TypeScript, ESM, Commander.js
- Set up `tsconfig.json`, build script, bin entry point
- Create directory structure
- Validate: `pulse --help` prints usage

### Phase 2: Auth Commands
- Implement `config.ts` (env var validation)
- Implement `session.ts` (file-backed storage adapter)
- Implement `supabase.ts` (client factory with custom storage)
- Implement `auth login`, `auth logout`, `auth whoami`
- Validate: full login/logout/whoami cycle works

### Phase 3: Date Commands
- Implement `date add` with all flags and validation
- Implement `date add-batch` with JSON file parsing and group support
- Add `preAction` auth guard on the `date` command group
- Validate: add and add-batch work with persisted auth

### Phase 4: Polish
- Error messages for all failure modes (network, auth, validation)
- Exit codes (0 = success, 1 = error)
- `--version` flag
- README with usage examples

## Sources

- Commander.js: command groups via `.addCommand()`, `preAction` hooks for auth guards, `.requiredOption()` for mandatory flags
- Supabase JS: custom storage adapter for `createClient` auth options, `signInWithPassword`, `getSession` for auto-refresh, `.from('confirmed_dates').insert()` for writes
