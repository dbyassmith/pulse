---
title: "feat: Add backend date search service"
type: feat
status: completed
date: 2026-03-08
origin: docs/brainstorms/2026-03-08-backend-date-search-service-brainstorm.md
---

# feat: Add backend date search service

## Overview

Create a new `backend/` folder in the monorepo containing an importable TypeScript module that searches the web for event dates. Given an event description like "WWDC 2026", the service queries the Brave Answers API for a web-grounded AI answer, then uses a single Claude call to extract a structured `DateSearchResult`.

**Consumers:** A separate agent process and a scheduled worker, both importing the module directly — no HTTP server needed (see brainstorm: `docs/brainstorms/2026-03-08-backend-date-search-service-brainstorm.md`).

## Problem Statement / Motivation

Currently, date searching is handled by Claude Code's built-in `WebSearch` tool, invoked through slash commands (`/pls-search`, `/pls-run`). This approach:
- Requires Claude Code to be installed and running locally
- Cannot be used by a scheduled worker or headless agent without spawning a Claude CLI subprocess
- Has no programmatic API — results are unstructured text in a conversation

A standalone search module decouples the search logic from Claude Code, making it callable from any TypeScript process.

## Proposed Solution

An importable async function `searchForDate(query: string): Promise<DateSearchResult>` that:

1. Calls the **Brave Answers API** (`/v1/chat/completions`) with the event description — this returns an AI-generated, web-grounded answer with inline citations
2. Passes the Brave answer + citations to a single **Claude `messages.parse()`** call with a Zod schema to extract the structured `DateSearchResult`

This is a two-step pipeline, not an agentic loop. The Brave Answers API handles the search-and-synthesis step (it runs its own LLM over real-time search results), and Claude handles the structured extraction.

### Flow

```
searchForDate("WWDC 2026")
  │
  ├─ Step 1: Brave Answers API
  │    POST /v1/chat/completions
  │    → "WWDC 2026 is scheduled for June 9-13, 2026, as announced by Apple..."
  │    → Citations: [{ url: "apple.com/...", snippet: "..." }]
  │
  ├─ Step 2: Claude Structured Extraction
  │    client.messages.parse() with Zod schema
  │    → { found: true, date: "2026-06-09", confidence: "high", source: "apple.com/...", ... }
  │
  └─ Return DateSearchResult
```

### Architecture

```
backend/
  src/
    index.ts              # Public API: export { searchForDate }
    search.ts             # Two-step pipeline orchestration
    brave-answers.ts      # Brave Answers API client
    lib/
      config.ts           # Env config (ANTHROPIC_API_KEY, BRAVE_API_KEY)
      types.ts            # DateSearchResult, Zod schema, related types
  package.json
  tsconfig.json
  .env                    # ANTHROPIC_API_KEY, BRAVE_API_KEY (gitignored)
  .env.example            # Template without real values
```

### Key Technical Decisions

**1. Brave Answers API instead of Web Search API (evolution from brainstorm)**

The brainstorm proposed Brave Web Search + an agentic Claude loop. During planning, we discovered the Brave Answers API — it bundles search + LLM synthesis into one call, returning a grounded answer with citations. This eliminates the need for an agentic loop entirely and reduces the architecture to a simple two-step pipeline. Trade-offs:
- Simpler architecture (2 API calls instead of up to 7)
- Lower cost (~$0.004-0.008 for Brave answer + ~$0.003 for Claude extraction)
- Rate limit is 2 QPS (vs 50 QPS for Web Search) — acceptable for our volumes
- Latency ~4.5s for Brave + ~1s for Claude extraction

**2. Confidence vocabulary: adopt existing `high` / `medium` / `low`**

The brainstorm proposed `confirmed / rumored / speculative / none`. However, the entire existing system (CLI, agent, desktop, iOS) uses `high / medium / low`. The Claude extraction prompt encodes the mapping:
- Official/first-party source → `high`
- Reputable press/journalism → `medium`
- Rumors, leaks, unverified → `low`
- Nothing found → return `found: false`

**3. Date ranges: return start date**

Multi-day events (e.g., "WWDC June 8-12") return the start date as the ISO string. The `notes` field captures the full date range. This matches the existing `confirmed_dates` table schema which expects a single `YYYY-MM-DD` value.

**4. Error contract: throw on infrastructure failures**

- Network errors, invalid API keys, malformed responses → `throw`
- Search completes but no date found → return `{ found: false }`
- Consumers should wrap calls in try/catch

**5. Model: `claude-sonnet-4-5-20250929`**

Single extraction call — Sonnet is more than sufficient and keeps costs low.

**6. Brave Answers API configuration**

- `enable_citations: true` — get source URLs for the confidence/source fields
- `enable_research: false` — single-search mode is sufficient for date lookups; keeps latency lower
- Model: `"brave"` (only option)
- OpenAI SDK-compatible endpoint format

### Return Type

```typescript
import { z } from "zod";

const DateSearchResultSchema = z.object({
  found: z.boolean(),
  date: z.string().nullable(),           // ISO YYYY-MM-DD or null
  confidence: z.enum(["high", "medium", "low"]).nullable(),
  source: z.string().nullable(),         // Primary source URL
  title: z.string(),                     // Event title as understood
  notes: z.string(),                     // Summary of findings, date range details
});

type DateSearchResult = z.infer<typeof DateSearchResultSchema>;
```

## Technical Considerations

### Claude Extraction Prompt

The extraction prompt receives the Brave answer text + citations and must:
- Extract a specific date (YYYY-MM-DD) if one exists — require a specific day, not just month/quarter
- Assess confidence based on source authority (from citations)
- Use the start date for multi-day events, note full range in `notes`
- Return `found: false` if the answer is speculative or no specific date is mentioned

### Brave Answers Response Parsing

The Brave Answers API returns a text response with inline XML-like tags for citations:
```
WWDC 2026 is scheduled for June 9-13, 2026<citation>{"url": "...", "snippet": "..."}</citation>
```

The client needs to:
1. Extract the plain text answer
2. Parse citation tags to get source URLs and snippets
3. Pass both to Claude for structured extraction

### Cost Estimate

Per `searchForDate` call:
- Brave Answers: ~$0.004-0.008 (1 search + minimal tokens)
- Claude extraction: ~$0.003 (small input, structured output)
- **Total: ~$0.007-0.011 per query**

For a daily worker processing 20 watchlist items: ~$0.15-0.22/day, ~$5-7/month.

### Rate Limiting

- Brave Answers: 2 QPS. Each `searchForDate` makes 1 Brave call. Concurrent callers should serialize if needed.
- Anthropic: standard limits, no concern at expected volumes.

## System-Wide Impact

- **No existing code changes required.** This is a new module; no existing files are modified.
- **New API keys needed:** `ANTHROPIC_API_KEY` and `BRAVE_API_KEY` must be provisioned.
- **`.gitignore` update:** Add `backend/.env` to root `.gitignore`.

## Acceptance Criteria

- [x] `backend/` folder exists with TypeScript project matching CLI conventions (ESM, ES2022, strict)
- [x] `searchForDate("WWDC 2026")` returns a valid `DateSearchResult`
- [x] Service makes exactly 1 Brave Answers API call + 1 Claude extraction call per invocation
- [x] Confidence values use existing `high` / `medium` / `low` vocabulary
- [x] Date is returned as ISO `YYYY-MM-DD` string (start date for ranges)
- [x] Brave answer citations are parsed and passed to Claude for source attribution
- [x] Function throws on API/network errors, returns `{ found: false }` on inconclusive searches
- [x] `.env.example` documents required environment variables
- [x] Package builds successfully with `tsc`

## Dependencies & Risks

- **Brave Answers API pricing:** ~$5/month free credit for new accounts. Budget accordingly.
- **Brave Answers rate limit:** 2 QPS is low. If batch processing many items, add delays between calls.
- **Anthropic API key:** Requires an active API account with sufficient credits.
- **Brave answer quality:** For obscure events, the answer may be vague or incorrect. The Claude extraction step should handle this gracefully by returning `found: false`.
- **Citation parsing:** The inline XML-like tags need reliable parsing. Edge cases: no citations returned, malformed tags.

## Implementation Order

### Phase 1: Project Scaffolding

1. Create `backend/` directory structure
2. Initialize `package.json` with `"type": "module"`
3. Create `tsconfig.json` matching CLI patterns
4. Create `.env.example` with `ANTHROPIC_API_KEY` and `BRAVE_API_KEY`
5. Add `backend/.env` to `.gitignore`
6. Install dependencies: `@anthropic-ai/sdk`, `dotenv`, `zod`

**Files:**
- `backend/package.json`
- `backend/tsconfig.json`
- `backend/.env.example`
- `.gitignore` (update)

### Phase 2: Core Types and Config

1. Define `DateSearchResult` Zod schema and TypeScript type in `types.ts`
2. Create `config.ts` for env loading (ANTHROPIC_API_KEY, BRAVE_API_KEY)

**Files:**
- `backend/src/lib/types.ts`
- `backend/src/lib/config.ts`

### Phase 3: Brave Answers Client

1. Implement `queryBraveAnswers(question: string)` function
2. Call `POST /v1/chat/completions` with `enable_citations: true`
3. Parse response text and extract inline citation tags
4. Return `{ answer: string, citations: Citation[] }`
5. Handle 429 rate limiting and error responses

**Files:**
- `backend/src/brave-answers.ts`

### Phase 4: Search Pipeline

1. Implement `searchForDate(query: string)` in `search.ts`
2. Call `queryBraveAnswers()` with the event description
3. Pass answer + citations to `client.messages.parse()` with the Zod schema
4. Write the Claude extraction prompt (confidence rules, date format, source attribution)
5. Return the validated `DateSearchResult`

**Files:**
- `backend/src/search.ts`

### Phase 5: Public API and Build

1. Create `index.ts` that re-exports `searchForDate` and the `DateSearchResult` type
2. Verify `tsc` builds successfully
3. Test manually with a few event descriptions

**Files:**
- `backend/src/index.ts`

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-08-backend-date-search-service-brainstorm.md](docs/brainstorms/2026-03-08-backend-date-search-service-brainstorm.md) — Key decisions carried forward: importable module (not HTTP), no caching, stateless. Evolved from brainstorm: replaced agentic loop with Brave Answers API + Claude extraction pipeline.
- **CLI patterns:** `cli/src/lib/config.ts`, `cli/tsconfig.json`, `cli/package.json` — ESM/TypeScript conventions to match
- **Existing search workflow:** `.claude/commands/pls-search.md` — confidence model and date-handling rules to encode in extraction prompt
- **Agent confidence model:** `agent/CLAUDE.md` — source credibility criteria
- **Anthropic SDK structured output:** [github.com/anthropics/anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript) — `client.messages.parse()` with Zod
- **Brave Answers API:** [api-dashboard.search.brave.com/documentation/services/answers](https://api-dashboard.search.brave.com/documentation/services/answers)
