---
title: "Goldfish CLI - Supabase Date Submission Tool"
category: "integration-issues"
tags: ["cli", "supabase", "typescript", "commander", "esm", "session-management", "bulk-insert"]
component: "cli"
severity: "info"
date_created: "2026-03-06"
problem_type: "implementation"
technologies: ["TypeScript", "Node.js", "Commander v14", "@inquirer/prompts v8", "@supabase/supabase-js v2", "uuid v13", "dotenv v17", "ES2022", "ESM"]
---

# Goldfish CLI: Confirmed Date Submission to Supabase

## Problem Statement

Managing confirmed dates in a Supabase-backed project requires a reliable, scriptable interface that works outside the browser. Teams need to add individual dates or batch-insert sets of related milestones from the command line, with persistent authentication and proper input validation.

## Solution Overview

A TypeScript CLI built with **Commander.js** that authenticates against Supabase, persists sessions to disk, and provides subcommands for adding single or batched confirmed dates. Interactive prompts via `@inquirer/prompts` handle the auth flow, while strict validation ensures data integrity before writes.

## Architecture

| Module | Path | Responsibility |
|--------|------|----------------|
| Entry point | `cli/src/index.ts` | Commander program definition with `auth` and `date` subcommand groups |
| Auth flow | `cli/src/commands/auth.ts` | `login`, `logout`, `whoami` — interactive email/password prompt |
| Date management | `cli/src/commands/date.ts` | `add` (single insert) and `add-batch` (bulk insert from JSON file) |
| Supabase client | `cli/src/lib/supabase.ts` | Wraps `createClient` with file-based session storage |
| Config | `cli/src/lib/config.ts` | Reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from environment |
| Session persistence | `cli/src/lib/session.ts` | File storage at `~/.goldfish/session.json` |

## Key Decisions

- **File-based session storage** instead of browser `localStorage`. A CLI has no DOM; persisting the Supabase session as a JSON file lets auth survive across invocations without external dependencies.
- **Strict file permissions** — directory created with mode `0o700`, session file written with mode `0o600` — so only the owning user can read credentials.
- **Input validation before any network call.** Dates validated with regex (`/^\d{4}-\d{2}-\d{2}$/`), confidence constrained to enum (`high | medium | low`). Failures exit early with a clear message.
- **Batch insert with `group_id`** — when inserting from a JSON file, an optional `--group-id` flag tags every row with the same identifier for easy querying or rollback.
- **UUID v4 for record IDs** — auto-generated client-side so the CLI can report the created ID immediately without a round-trip read.

## Supabase Table Schema

Table: `confirmed_dates`

| Column | Description |
|--------|-------------|
| `id` | UUID primary key (client-generated) |
| `user_id` | UUID from authenticated session |
| `title` | Text description of the date |
| `date` | Date value (YYYY-MM-DD) |
| `confidence` | Enum: high, medium, low |
| `source` | Optional text — where the date came from |
| `notes` | Optional text — additional context |
| `group_id` | Optional UUID — shared across batch entries |
| `group_index` | Integer — ordering within a batch |

## Usage Examples

```bash
# Authenticate interactively
goldfish auth login

# Check current session
goldfish auth whoami

# Add a single confirmed date
goldfish date add \
  --title "Project Launch" \
  --date 2026-04-01 \
  --confidence high \
  --source "PM"

# Batch-add from a JSON file
goldfish date add-batch \
  --file dates.json \
  --group-id "q2-milestones"

# Log out (deletes ~/.goldfish/session.json)
goldfish auth logout
```

### JSON Batch Format

```json
[
  {
    "title": "Sprint 1 Complete",
    "date": "2026-04-01",
    "confidence": "high",
    "source": "Engineering"
  },
  {
    "title": "Sprint 2 Complete",
    "date": "2026-04-15",
    "confidence": "medium"
  }
]
```

## Best Practices

- **Always validate date format before insert.** Reject malformed dates at the CLI layer before they reach Supabase.
- **Keep session files secure.** Maintain `0o600` on files and `0o700` on directories for any paths storing tokens.
- **Use RLS policies in Supabase for `user_id` scoping.** Never rely solely on client-side filtering.
- **Add `.env` to `.gitignore`.** The `.env` file holds credentials and must never be committed. Consider adding a `.env.example` with placeholder values.

## Potential Issues to Watch

- **Session token expiry edge cases.** Auto-refresh is enabled, but long-lived processes or clock skew can miss the refresh window. Guard against this by catching `401` responses.
- **Batch insert size limits.** Supabase (via PostgREST) imposes per-request row limits. Large batch files should be chunked (e.g., 500 rows per request).
- **Missing `.env` file.** If absent or incomplete, fail early with a clear message pointing to `.env.example`.

## Future Improvements

- Add `date list` command with optional filters (`--from`, `--to`, `--limit`)
- Add `date delete` command with confirmation prompt
- Add `--dry-run` flag for batch imports
- Add JSON schema validation for batch files (e.g., with `zod`)
- Add `date update` command for corrections by ID

## Cross-References

- **Existing plan:** `cli/docs/plans/2026-03-06-feat-goldfish-cli-plan.md`
- **Supabase Auth (signInWithPassword):** Supabase JS reference docs
- **Supabase custom storage adapter:** `auth.storage` option on `createClient`
- **Commander.js subcommands:** `.addCommand()` pattern for command groups
- **File-based CLI auth pattern:** Similar to GitHub CLI (`gh`), Firebase CLI, and Supabase CLI token storage
