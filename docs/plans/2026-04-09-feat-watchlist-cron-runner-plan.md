---
title: "feat: Server-side watchlist cron runner"
type: feat
status: completed
date: 2026-04-09
---

# Server-Side Watchlist Cron Runner

## Overview

Add a scheduled server-side sweep that walks every active row in `watchlist_items`, calls the existing `searchForDate` primitive to look for a confirmed date, and promotes matches into `confirmed_dates`. Trigger the sweep from a GitHub Actions cron workflow that hits a new protected endpoint on the backend.

This replaces the old Claude-Code-driven `agent/` slash-command workflow (`/pls-run` over markdown files) with an always-on database-backed job that does not require a human sitting at a terminal.

## Problem Frame

The iOS app can now add watchlist items and read confirmed dates from Supabase, but nothing on the server side ever looks at those items after they are created. Users add a "WWDC 2026" watchlist entry and it just sits there — the only existing way to resolve it is the deprecated file-based `/pls-run` flow in `agent/`, which requires a local Claude Code session.

The goal is a hands-off cron that periodically asks Brave "is there a confirmed date for this?" for every active item, promotes the hits, and records progress so items do not get re-searched unnecessarily.

## Requirements Trace

- **R1.** A scheduled job sweeps every row in `watchlist_items` with `status = 'active'` across all users.
- **R2.** For each item, the runner calls the existing `searchForDate` primitive (Brave Answers + Claude extraction) using a query derived from the item's title and category.
- **R3.** When a search returns `found: true` and the result's confidence meets or exceeds the item's confidence threshold, a new row is inserted into `confirmed_dates` (attributed to the same `user_id`) and the watchlist item is moved to `status = 'resolved'`.
- **R4.** Every processed item has its last-checked timestamp updated so subsequent runs can skip recently-checked items.
- **R5.** The trigger is a GitHub Actions `schedule:` workflow that calls a protected backend endpoint. The endpoint rejects any request without a valid shared secret.
- **R6.** A run returns (and logs) a structured summary — items scanned, items resolved, items skipped, items that errored — so results are inspectable from the GitHub Actions run view.
- **R7.** The workflow supports manual triggering via `workflow_dispatch` for ad-hoc runs.

## Scope Boundaries

- **Out of scope — requeue logic.** The old system had `recurring-irregular`, `series`, `category-watch`, and `recurring-predictable` requeue rules that spawn a new watchlist entry after a date passes. The current `watchlist_items` schema does not carry the fields (`search_queries`, `confirmed_when`, `parent_id`, `date_estimate`) needed to do this responsibly. Track the resolved item and stop; requeueing is a follow-on plan.
- **Out of scope — multi-query strategy per item.** The old system stored 2–4 search queries per item and tried them in order. v1 uses one derived query per item (title + optional category hint). Promote to a multi-query or agent-loop strategy only if v1 results are weak in practice.
- **Out of scope — per-user run limits or quota.** v1 runs everything in a single pass.
- **Out of scope — surfacing run status in the iOS UI.** The new `last_checked_at` column is a backend concern for this plan; any iOS work to show "last checked N hours ago" is a follow-on.
- **Out of scope — backoff on repeatedly-unresolved items.** v1 re-checks everything that has not been checked within the configured cooldown window. Exponential backoff is deferred.

## Context & Research

### Relevant Code and Patterns

- **`backend/src/search.ts` — `searchForDate(query)`.** Already wraps Brave Answers + Claude extraction and returns `{ found, date, confidence, source, title, notes }`. This is the primitive the runner loops over. No changes needed here.
- **`backend/src/brave-answers.ts`.** SSE handling and rate-limit awareness are already in place. The runner does not need to touch this directly.
- **`backend/src/agent/tool-executor.ts`.** `executeAddConfirmedDate` and `executeUpdateWatchlistItem` show the exact shape used when the conversational agent promotes an item — reuse the same column layout, `user_id` scoping, and lowercase-category normalization in the runner.
- **`backend/src/server.ts`.** Existing `/chat` endpoint pattern — Zod body validation, auth middleware, rate limiting, structured error JSON. The new cron route should follow the same shape but swap JWT auth for a shared-secret header.
- **`backend/src/lib/supabase.ts`.** Currently only exports `createAuthenticatedClient(accessToken)` (per-user JWT). The cron needs to operate across all users, so a new `createServiceClient()` helper will be added using `SUPABASE_SERVICE_ROLE_KEY`.
- **`backend/src/lib/config.ts`.** Central env-var validator. All new env vars (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, optional `WATCHLIST_CHECK_COOLDOWN_HOURS`) need to flow through here.
- **`ios/goldfish/Shared/WatchlistItem.swift`.** Current Swift model fields are `id, title, type, category, subcategory, status, notes, added`. Since this is the source of truth for "what a watchlist item is" on the client, any new columns must be nullable so the iOS app keeps decoding existing rows without change.
- **`agent/CLAUDE.md` and `agent/.claude/commands/pls-run.md`.** The "old claude code version" the user referenced. These spell out the confidence-threshold resolution rules and the intended failure modes. The new runner mirrors the resolution logic (`found AND confidence >= threshold`) but drops the file-based ceremony.

### Institutional Learnings

- **`todos/015-complete-p2-brave-sse-line-buffering-bug.md`** and other P1/P2 todos show the team has already been bitten by Brave timeouts, SSE parsing edge cases, and missing input validation. Treat every `searchForDate` call in the loop as something that can throw — catch per-item so one bad item does not kill the whole run.
- **`todos/017-complete-p2-singleton-client-parallel-tools.md`.** The Anthropic client is already a module-scope singleton in `search.ts`; the runner should not instantiate its own.
- **`todos/023-complete-p3-external-api-timeouts.md`.** Brave calls already use `AbortSignal.timeout(30s)`. The runner should add an overall per-run wall-clock budget on top, not per-call timeouts.

### External References

Not consulted for v1. The design reuses in-repo primitives and a standard GitHub Actions cron pattern; Supabase service-role-client usage is the only external concept and is well-documented in the `@supabase/supabase-js` README that the team already uses.

## Key Technical Decisions

- **Trigger: GitHub Actions `schedule` → protected HTTP endpoint.** Chosen over in-process `node-cron` (couples background work to the request server and can double-fire on multi-replica deploys), Supabase `pg_cron` (needs `pg_net` + SQL setup outside the code repo), and a separate worker binary (requires host-specific scheduler config that does not exist in this repo yet). GitHub Actions is free, runs out-of-band, retries are visible in the Actions UI, and `workflow_dispatch` gives a zero-cost manual trigger. Rationale confirmed with the user.
- **Service-role Supabase client for the runner only.** RLS is the right posture for the `/chat` path, but the cron needs to read rows across all users. Introduce `createServiceClient()` in `backend/src/lib/supabase.ts` and use it **exclusively** inside the runner module. Do not pass the service client into any user-facing code path.
- **Shared-secret auth, not JWT, for the cron endpoint.** The endpoint is machine-to-machine; a long random `CRON_SECRET` stored as a GitHub Actions secret and compared in constant time is simpler and has no refresh-token concerns. Reject any request missing the header with 401 before doing any work.
- **Reuse `searchForDate(query)` directly; no agent loop.** The existing primitive already combines Brave Answers with Claude extraction and returns a confidence level. A full agent loop (like `/chat`) would add latency and token spend with no clear accuracy win over a first-pass title-based search. If v1 results are weak, the runner is small enough to upgrade to an agent loop without reshaping the plan.
- **Serial execution with a small inter-item delay.** v1 processes items one at a time with a ~1-second pause between Brave calls. This is the simplest posture that stays well below Brave's rate limit and produces deterministic logs. Parallelism is a follow-on once we know typical run sizes.
- **Cooldown-based skip list, not explicit state machine.** A new `last_checked_at` timestamp on `watchlist_items` plus a runtime threshold (default 20 hours) means repeated runs the same day are idempotent without a separate "in-progress" state. Simpler than tracking an explicit `next_check_at` or backoff table.
- **Default confidence threshold = `medium`, overridable per-item.** The `watchlist_items` table gets an optional `confidence_threshold` column. When null, the runner treats it as `medium`. High-stakes items (payments, travel) can set `high`; speculative items can set `low`.
- **Nullable schema additions only.** Every new column on `watchlist_items` is nullable so the existing iOS Swift decoder does not have to change in lockstep. The iOS app can ignore the new columns indefinitely.

## Open Questions

### Resolved During Planning

- **Where does the cron live?** Resolved: GitHub Actions → protected `/cron/run-watchlist` endpoint. User-confirmed.
- **Does the runner need to handle requeue?** Resolved: no, deferred to a follow-on plan. The current schema lacks the fields, and the user's stated goal is "step through each item and see if we have a date."
- **Does the runner need a service-role key, or can it use an anon key + a custom policy?** Resolved: service-role. The alternative (a bypass RLS policy gated on a secret) moves trust into Postgres and complicates future schema work.
- **Should the new columns live on `watchlist_items` or a separate `watchlist_checks` table?** Resolved: on `watchlist_items`. A separate history table is a valid future shape, but v1 only needs "when did we last check" + "what did we find last time?" — both fit naturally as nullable columns on the main row.

### Deferred to Implementation

- **Exact cooldown default.** The plan picks 20 hours as a starting point to cover daily runs without double-checking. The implementer should make it a config env var (`WATCHLIST_CHECK_COOLDOWN_HOURS`) so it can be tuned without a code change.
- **Per-run item cap.** Some runs may see hundreds of items eventually. Implementer decides whether to cap `limit` (e.g., 200) or accept that one run may be long. Starting simple is fine; add a cap when it actually becomes a problem.
- **Whether to include category + subcategory in the search query string.** The runner should build one query from the item; whether it is `"<title>"` alone vs. `"<title> <category>"` is a tuning detail the implementer can settle by eyeballing a handful of real items at the REPL.
- **Constant-time secret comparison.** The runner should not do a naive `=== secret` check in the handler; the exact helper (Node's `crypto.timingSafeEqual` or similar) is an implementation choice.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌───────────────────┐
│ GitHub Actions    │
│ schedule: daily   │
│ workflow_dispatch │
└─────────┬─────────┘
          │ POST /cron/run-watchlist
          │ Authorization: Bearer $CRON_SECRET
          ▼
┌───────────────────────────┐
│ Express: server.ts        │
│  ├─ verify secret (const- │
│  │   time compare)        │
│  └─ call runWatchlistSweep│
└─────────┬─────────────────┘
          │
          ▼
┌───────────────────────────────────────────────┐
│ watchlist-runner.ts (new module)              │
│                                                │
│  1. service client: createServiceClient()     │
│  2. load active items where                   │
│     last_checked_at IS NULL                   │
│       OR last_checked_at < now - cooldown     │
│  3. for each item (serial, small delay):     │
│       ├─ build query from title + category   │
│       ├─ call searchForDate(query)            │
│       ├─ if found && confidence >= threshold:│
│       │    insert into confirmed_dates        │
│       │    update watchlist_items.status =   │
│       │      'resolved'                       │
│       ├─ update last_checked_at +             │
│       │  last_search_found +                  │
│       │  last_search_notes                    │
│       └─ catch per-item errors; continue      │
│  4. return summary                            │
└─────────┬─────────────────────────────────────┘
          │
          ▼
  { scanned, resolved, skipped, errored, duration_ms }
```

The flow has exactly three moving parts: a workflow file that knows the URL and the secret, a thin HTTP handler that does auth and delegation only, and a pure-ish runner module that owns all the decision logic. Keeping the runner as a plain exported function makes it trivial to unit-test and to call from ad-hoc scripts.

## Implementation Units

- [ ] **Unit 1: Schema additions on `watchlist_items` (applied in Supabase cloud)**

**Goal:** Give the runner the columns it needs to track checks and results. The project uses Supabase cloud as the source of truth for schema — this unit is applied manually via the Supabase SQL editor, not committed as a migration file.

**Requirements:** R3, R4

**Dependencies:** None

**Files:**
- Document in: this plan file (the SQL below is the full change; paste it into Supabase Studio's SQL editor to apply)
- No code file changes in this unit

**Approach:**
- Add the following **nullable** columns to `watchlist_items`:
  - `last_checked_at timestamptz`
  - `last_search_found boolean`
  - `last_search_notes text`
  - `confidence_threshold text` *(accepts `'high' | 'medium' | 'low'`; null means default)*
- Add a supporting partial index on `(last_checked_at NULLS FIRST)` scoped to `status = 'active'` so the runner's query is cheap even as the table grows.
- No changes to existing columns. No data backfill — null values naturally sort first in the runner's ordering.

**SQL to paste into Supabase Studio → SQL editor (single project):**

```sql
alter table public.watchlist_items
  add column if not exists last_checked_at     timestamptz,
  add column if not exists last_search_found   boolean,
  add column if not exists last_search_notes   text,
  add column if not exists confidence_threshold text
    check (confidence_threshold in ('high','medium','low'));

create index if not exists watchlist_items_active_last_checked_idx
  on public.watchlist_items (last_checked_at nulls first)
  where status = 'active';
```

**Patterns to follow:**
- The current `watchlist_items` schema already uses `updated_at timestamptz`; mirror that type for `last_checked_at`.
- Keep every new column nullable to preserve backward compatibility with the iOS Swift decoder in `ios/goldfish/Shared/WatchlistItem.swift`.
- Use `add column if not exists` / `create index if not exists` so the statement is safe to re-run if it is applied twice by mistake.

**Test scenarios:**
- Test expectation: none — this is a pure schema change with no behavioral code. Verification is operational (see below).

**Verification:**
- The statement runs cleanly in Supabase Studio.
- `select count(*) from watchlist_items where last_checked_at is null;` equals the count of existing rows (all are null post-migration).
- The Studio table view shows the four new columns and the new index is listed under the table's indexes.
- The iOS app still decodes watchlist rows after the change (`WatchlistView` loads without errors), confirming the nullable-column compatibility assumption.
- Since there is no dev Supabase project, take a Supabase point-in-time snapshot (or at minimum note the current row count) immediately before running the statement so you can roll back if something unexpected happens. The `if not exists` guards mean the statement is safe to re-run, but they do not help if the column additions themselves were wrong.

---

- [ ] **Unit 2: Service-role Supabase client and config**

**Goal:** Add the backend plumbing the runner needs to read/write across all users and to authenticate incoming cron requests.

**Requirements:** R5

**Dependencies:** Unit 1 is not strictly required but it is the natural moment to update the env scaffolding.

**Files:**
- Modify: `backend/src/lib/supabase.ts` *(add `createServiceClient()` helper)*
- Modify: `backend/src/lib/config.ts` *(add `supabaseServiceRoleKey`, `cronSecret`, and `watchlistCheckCooldownHours` with validation and sensible defaults)*
- Modify: `backend/.env.example` *(document the new env vars)*
- Test: `backend/src/lib/__tests__/config.test.ts` *(if the repo has no existing backend test harness yet, the implementer should add a minimal `vitest` or `node --test` setup in this unit; mention explicitly in the PR)*

**Approach:**
- `createServiceClient()` mirrors `createAuthenticatedClient()` but uses `SUPABASE_SERVICE_ROLE_KEY` and omits the `Authorization` header override. It should live in the same file and be a separate exported function, not a parameter on the existing one — the goal is to make it grep-able.
- `getConfig()` continues to throw on missing `ANTHROPIC_API_KEY` / `BRAVE_API_KEY` / `SUPABASE_URL` / `SUPABASE_ANON_KEY` (unchanged). The new vars should also throw on missing so misconfigured deploys fail loudly at boot, except `watchlistCheckCooldownHours` which defaults to 20.
- `CRON_SECRET` should be at least 32 characters long. Enforce at config load, not at request time.

**Patterns to follow:**
- Existing `getConfig()` in `backend/src/lib/config.ts` — keep the same "destructure env, assert, return" shape.

**Test scenarios:**
- Happy path: env fully populated → `getConfig()` returns all fields including the new ones.
- Error path: `SUPABASE_SERVICE_ROLE_KEY` missing → throws with a clear message.
- Error path: `CRON_SECRET` missing or shorter than 32 chars → throws.
- Happy path: `WATCHLIST_CHECK_COOLDOWN_HOURS` unset → defaults to 20.
- Edge case: `WATCHLIST_CHECK_COOLDOWN_HOURS=0` is accepted and means "always check" (useful for manual runs).

**Verification:**
- Starting the dev server with the new env vars present logs no errors.
- Starting the dev server with `CRON_SECRET` unset fails fast with the expected message.

---

- [ ] **Unit 3: Watchlist runner module**

**Goal:** One pure-ish exported function that loads active items, calls `searchForDate`, promotes matches, and returns a structured summary. This is the behavioral core of the feature.

**Requirements:** R1, R2, R3, R4, R6

**Dependencies:** Unit 1 (schema), Unit 2 (service client + config)

**Files:**
- Create: `backend/src/watchlist-runner.ts`
- Test: `backend/src/__tests__/watchlist-runner.test.ts`

**Approach:**
- Export a single `runWatchlistSweep(options?: { now?: Date; cooldownHours?: number; limit?: number })` function. Options exist only for testing; production callers use defaults.
- Internally:
  1. Instantiate the service client via `createServiceClient()`.
  2. Query `watchlist_items` where `status = 'active'` and (`last_checked_at IS NULL` OR `last_checked_at < now - cooldown`). Order by `last_checked_at NULLS FIRST`. Select only the columns needed: `id, user_id, title, category, subcategory, confidence_threshold`.
  3. For each row, build a search query from `title` (and optionally append `category` when it would disambiguate — treat this as a single pluggable `buildQuery(item)` helper for easy iteration).
  4. Call `searchForDate(query)` inside a per-item `try/catch`. On throw, record `errored` and move on — do **not** update `last_checked_at` for errored items so the next run retries them.
  5. Determine whether the result meets the item's effective threshold (`confidence_threshold ?? 'medium'`). Use a `meetsThreshold(resultConfidence, itemThreshold)` helper with the tiered rule from `agent/CLAUDE.md`.
  6. On a match, insert into `confirmed_dates` (reusing the column layout from `executeAddConfirmedDate` — same required fields, same lowercase-category normalization) **and** update the watchlist row to `status = 'resolved'` with `last_checked_at`, `last_search_found = true`, `last_search_notes = result.notes`. If either write fails, record the item as `errored` and include the error in the summary.
  7. On a non-match, update `last_checked_at`, `last_search_found`, and `last_search_notes`; leave `status` as `active`.
  8. Await a short configurable delay between items (default ~1s) to stay below Brave's rate limit.
  9. Return `{ scanned, resolved, skipped, errored, items: [{ id, action, result? }], duration_ms }`.
- Keep the runner free of Express types; it takes no `req`/`res`. The HTTP wrapper in Unit 4 owns everything HTTP.

**Execution note:** Test-first. The runner is the one place in this plan where logic density justifies writing failing tests before the implementation so the confidence-threshold rules and error-handling behavior are nailed down from the start.

**Patterns to follow:**
- Anthropic client singleton pattern in `backend/src/search.ts` — do not instantiate multiple Supabase clients per run; reuse one service client for the whole sweep.
- Zod input parsing and error-returning style in `backend/src/agent/tool-executor.ts` — the runner does not take external input but the internal helpers should still return typed, discriminated results rather than throwing.
- Lowercase-and-trim normalization for `category` and `subcategory` from `executeAddConfirmedDate`.

**Test scenarios:**
- Happy path — single match: one active item, `searchForDate` returns `found: true, confidence: 'medium'`, item has default threshold → one `confirmed_dates` insert with correct `user_id`, watchlist row updated to `resolved`, summary counts `resolved: 1`.
- Happy path — single no-match: `searchForDate` returns `found: false` → no insert, watchlist row's `last_checked_at` updated, `status` stays `active`, summary counts `scanned: 1, resolved: 0`.
- Happy path — confidence below threshold: `searchForDate` returns `found: true, confidence: 'low'`, item's `confidence_threshold: 'high'` → **no** insert, `last_checked_at` still updated, `last_search_found: true`, summary counts `scanned: 1, resolved: 0`.
- Happy path — null threshold treated as medium: item has `confidence_threshold: null`, search returns `medium` → resolved; same item with `low` → not resolved.
- Edge case — cooldown filter: two active items, one with `last_checked_at = now - 1h`, one with `last_checked_at = null`. With default 20h cooldown, only the null one is processed; the other is not even fetched.
- Edge case — zero items: `scanned: 0`, all counts zero, function returns cleanly.
- Edge case — per-item cap: `limit: 5` with 20 eligible rows → exactly 5 processed, summary reflects that.
- Error path — `searchForDate` throws: other items still complete, errored item's `last_checked_at` is **not** updated, summary `errored: 1` with the item id and the error message (string, not the Error object).
- Error path — Supabase insert into `confirmed_dates` fails (simulated via mock): watchlist row is **not** updated to `resolved`, errored count increments.
- Error path — Supabase update to `watchlist_items` fails after a successful `confirmed_dates` insert: the item appears in both `errored` and the confirmed_dates summary block so the operator can reconcile manually. Document this failure mode in the summary format.
- Integration scenario — mock Supabase + mock `searchForDate`: three items (one match, one miss, one error) → summary counts `{ scanned: 3, resolved: 1, skipped: 1, errored: 1 }` and the returned `items` array contains one entry per id with the correct `action`.

**Verification:**
- Unit tests above all pass.
- Running the function locally against a dev Supabase with a handful of seeded watchlist items produces a summary matching what Supabase Studio shows after the run.

---

- [ ] **Unit 4: Protected `/cron/run-watchlist` endpoint**

**Goal:** Thin HTTP wrapper that authenticates the cron request and delegates to the runner.

**Requirements:** R5, R6, R7

**Dependencies:** Unit 3

**Files:**
- Modify: `backend/src/server.ts`
- Test: `backend/src/__tests__/server-cron.test.ts`

**Approach:**
- Add a new `POST /cron/run-watchlist` route **outside** `chatLimiter` (use a dedicated limiter with a much smaller window, e.g., 5 requests per minute, so an accidental double-run does not hammer Brave).
- Verify the `Authorization: Bearer <secret>` header with a constant-time comparison against `getConfig().cronSecret`. Missing / mismatched → 401 with a generic body; do not echo the secret back.
- On success, `await runWatchlistSweep()` and respond with `200 application/json` containing the summary. On thrown errors inside the runner, respond with `500` and a short error body — the Actions workflow will surface the failure.
- Log a one-line structured summary on each run (`console.log(JSON.stringify({ kind: 'watchlist-run', ...summary }))`) so host logs are scannable.
- Do **not** set SSE headers. This is a plain JSON endpoint.

**Patterns to follow:**
- `/chat` route in `backend/src/server.ts` for shape (helmet, limiter, auth check, body handling) but swap JWT auth for a shared-secret header and drop the SSE wiring.
- Body validation: none needed — GitHub Actions sends an empty body.

**Test scenarios:**
- Happy path: correct secret → 200 with summary JSON, runner called exactly once.
- Error path: missing header → 401, runner not called.
- Error path: wrong secret → 401, runner not called. Use a value with a different length from the expected secret **and** a value with the same length to verify the comparison handles both.
- Error path: correct secret but `runWatchlistSweep` rejects → 500, response body contains a generic error message (not the stack).
- Edge case: endpoint is reachable only via POST — GET returns 404 or 405.
- Integration scenario — dedicated rate limiter: 10 rapid correct-secret requests from the same IP → the sixth onwards receive 429 while the first five pass through to the runner (or the configured cap, whichever the implementer picks; verify the cap is enforced and documented).

**Verification:**
- `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/cron/run-watchlist` against a dev backend returns a summary JSON.
- Same command without the header returns 401.
- Server log line for the run is present and parseable as JSON.

---

- [ ] **Unit 5: GitHub Actions cron workflow**

**Goal:** The actual scheduler that fires the endpoint once a day and supports manual runs.

**Requirements:** R5, R6, R7

**Dependencies:** Unit 4 (endpoint must exist)

**Files:**
- Create: `.github/workflows/watchlist-cron.yml`
- Document in: `README.md` (short "How the cron runs" section pointing at this workflow and the two secrets/vars it needs)

**Approach:**
- Single job with `schedule: - cron: '0 9 * * *'` (daily at 09:00 UTC — tune in code review if a different local-business-day window is preferred) plus `workflow_dispatch:` for manual triggering.
- Uses repository-level secret `CRON_SECRET` and repository-level variable `BACKEND_URL`. Document both in the README.
- Body of the job: a single `curl` that POSTs to `${{ vars.BACKEND_URL }}/cron/run-watchlist` with `Authorization: Bearer ${{ secrets.CRON_SECRET }}`, `--fail-with-body`, a 5-minute `--max-time`, and `-sS` so curl fails non-zero on HTTP 4xx/5xx and surfaces the body in the logs.
- Pipe the response through `tee` so the JSON summary is visible in the Actions run view.
- Do not retry inside the workflow. If the run fails, the next day's schedule (or a manual `workflow_dispatch`) is the retry mechanism.

**Patterns to follow:**
- No existing workflows in this repo. Keep the file self-contained and dead simple so it is easy to copy if a second cron is ever needed.

**Test scenarios:**
- Test expectation: none — this is a pure workflow file with no behavioral code. Verification is operational (see below).

**Verification:**
- Running the workflow via `workflow_dispatch` in the GitHub UI hits the deployed backend, returns 200, and the summary JSON is visible in the run log.
- Running it with an intentionally wrong `CRON_SECRET` produces a red run with a visible 401 body.
- Scheduled run fires once at 09:00 UTC the next morning and its log appears in the Actions tab.

## System-Wide Impact

- **Interaction graph:** A new external trigger path (GitHub Actions) touches the backend for the first time. The cron endpoint shares `backend/src/server.ts` with `/chat` and `/health` but does not share auth middleware, rate limiters, or the request-scoped Supabase client. Make this separation obvious in the code organization.
- **Error propagation:** Per-item errors must be caught inside the runner — a single bad item cannot abort the sweep. The HTTP handler catches runner-level errors and returns 500 with a generic body. The workflow surfaces the HTTP failure and the run's JSON body if any. No errors silently disappear.
- **State lifecycle risks:** The two-write sequence "insert confirmed_dates → update watchlist_items.status" is not atomic. Supabase client transactions would be ideal, but the simpler pragmatic choice for v1 is to (a) insert first, (b) update second, and (c) treat a failed second write as an `errored` item visible in the summary. Document this so operators know a rare "confirmed but still active" state is possible and how to reconcile it.
- **API surface parity:** None of the new columns (`last_checked_at`, `last_search_found`, `last_search_notes`, `confidence_threshold`) are referenced by the iOS Swift model yet. They are nullable so decoding is unaffected. When iOS wants to show "last checked N hours ago", it only needs a follow-on decoder-level change.
- **Integration coverage:** The end-to-end path "Actions → endpoint → runner → Brave → Supabase" is not exercised by unit tests. The `Verification` bullets on Unit 4 and Unit 5 are the only coverage for the full path and should be run manually against a staging backend before scheduling is turned on in production.
- **Unchanged invariants:** `/chat`'s per-user RLS posture is unchanged. The service-role client lives behind `createServiceClient()` and is only imported by the runner module — no user-facing code path gains service-role access.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Leaking `SUPABASE_SERVICE_ROLE_KEY` via logs or error bodies | Never echo env vars. The 500 error body from the cron endpoint must be generic. The runner's `console.log` summary must never include env values or the secret. |
| `CRON_SECRET` weakness or accidental check-in | Enforce 32+ char length in `getConfig()`. Store in GitHub Actions secrets only. Never reference in `.env.example` beyond a `CRON_SECRET=replace-me-32-chars-min` placeholder. |
| A single slow Brave call blocks the whole run | Brave calls already enforce 30s per-call (`AbortSignal.timeout(30_000)` in `brave-answers.ts`). Combined with serial execution and a reasonable item cap, total run time is bounded. The workflow's `curl --max-time 300` is the final safety net. |
| Brave rate-limit (429) mid-run | The runner should catch a 429 from Brave, stop processing further items, include the partial summary, and return. Next scheduled run picks up where it left off because un-processed items still have null/stale `last_checked_at`. |
| Two-write non-atomicity (confirmed inserted, watchlist update fails) | Per Unit 3 test scenario: this state surfaces in the summary's `errored` list with a clear message so an operator can manually resolve. Consider a follow-on plan for a Postgres function that does both writes in one RPC. |
| Incorrect confidence-threshold logic letting speculative dates promote | Unit 3 test scenarios pin the behavior at `low`/`medium`/`high` and at `null` explicitly. Any change to `meetsThreshold` requires updating tests. |
| iOS decoder breakage from new columns | All new columns are nullable. The iOS Swift model already tolerates unknown keys at the Codable level (other fields like `source`, `notes`, `created_at` are already optional). Verified by keeping `WatchlistView` working against a migrated dev DB as part of Unit 1 verification. |
| Duplicate concurrent runs (manual `workflow_dispatch` during a scheduled run) | The dedicated cron-endpoint limiter in Unit 4 (small window) makes the second run fail fast. If stronger protection is needed, add a Postgres advisory lock in Unit 3 — treated as a follow-on, not v1. |
| Schema changes go straight to the single production Supabase project (no dev project to test against) | Take a Supabase point-in-time snapshot immediately before applying the Unit 1 SQL so there is a rollback target. The `if not exists` guards make the statement safe to re-run, and the change only adds nullable columns + a partial index — no column drops, no type changes, no data mutations. Keep this plan file as the canonical record of what was applied. |

## Documentation / Operational Notes

- **Deploy order:** (1) take a Supabase point-in-time snapshot for rollback safety, (2) paste the Unit 1 SQL into Supabase Studio and verify the four new columns + index appear, (3) set `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and `WATCHLIST_CHECK_COOLDOWN_HOURS` on the backend host, (4) deploy the backend so the `/cron/run-watchlist` endpoint exists, (5) set `CRON_SECRET` (secret) and `BACKEND_URL` (variable) in GitHub repo settings, (6) merge the workflow file — the first scheduled run happens at the next 09:00 UTC, or trigger it manually via `workflow_dispatch` to smoke-test.
- **README update:** A small "Watchlist cron" section explaining what it does, how to trigger it manually, and where to find its logs (Actions tab + backend host logs). Point at the plan file for deeper context.
- **Monitoring:** The runner's single-line structured JSON log is the primary signal. Set up a host-level alert on repeated non-zero exit codes from the Actions workflow (optional, follow-on).
- **Rollback:** If the runner misbehaves, disable the GitHub Actions workflow (one click in the Actions tab) — no code revert needed. The endpoint itself is harmless without the cron hitting it.
- **Cost awareness:** Each active watchlist item costs one Brave Answers call + one Claude extraction call per run. With daily cadence and a medium cooldown, expect ~1 × (active item count) of each per day. Worth keeping an eye on once there are >100 active items.

## Sources & References

- **Current runner-eligible primitives:** `backend/src/search.ts`, `backend/src/brave-answers.ts`
- **Pattern references:** `backend/src/agent/tool-executor.ts` (column layout for promoted items), `backend/src/server.ts` (Express route shape), `backend/src/lib/supabase.ts` + `backend/src/lib/config.ts` (client + env patterns)
- **Old workflow being superseded:** `agent/CLAUDE.md`, `agent/.claude/commands/pls-run.md`
- **iOS decoder compatibility anchor:** `ios/goldfish/Shared/WatchlistItem.swift`
- **Prior plan (for historical context, not requirements trace):** `docs/plans/2026-03-06-feat-goldfish-agent-watchlist-system-plan.md`
