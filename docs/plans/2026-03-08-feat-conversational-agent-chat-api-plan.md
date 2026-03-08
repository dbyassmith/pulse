---
title: "feat: Conversational Agent Chat API"
type: feat
status: completed
date: 2026-03-08
origin: docs/brainstorms/2026-03-08-conversational-agent-api-brainstorm.md
---

# feat: Conversational Agent Chat API

## Overview

Add a conversational chat API to the existing `backend/` package that lets users interact with Goldfish through natural language. The agent orchestrates existing services — date search, confirmed date storage, watchlist management — via Claude's tool use API, streaming responses back to the iOS app over SSE.

**Example:** "When is the NFL draft this year?" → agent searches → finds date → responds with answer → saves to user's account automatically.

## Problem Statement / Motivation

The current agent workflow requires Claude Code slash commands (`/pls-search`, `/pls-watch`, `/pls-run`) — developer-only tools. The iOS app has no way to interact with the agent. Users should be able to ask questions and manage their dates conversationally from their phone.

(see brainstorm: docs/brainstorms/2026-03-08-conversational-agent-api-brainstorm.md)

## Proposed Solution

Add Express to the `backend/` package with a single `POST /chat` endpoint. The server runs a Claude tool-use loop, executing tools server-side and streaming the full response (including intermediate status) back via SSE. Stateless — the client sends the full message history each request.

### Architecture

```
iOS App → POST /chat (messages[]) → Express Server
                                        ↓
                                   Claude API (tool use)
                                    ↓           ↓
                              Tool execution   Text streaming
                              (search, save)   via SSE
                                    ↓
                              Supabase writes
```

### Authentication

The iOS app already authenticates with Supabase and holds a JWT. The chat API will:

1. iOS sends its Supabase access token in the `Authorization: Bearer <token>` header
2. Backend calls `createClient(url, anonKey, { global: { headers: { Authorization: 'Bearer <token>' } } })` — this creates a client that executes queries as the authenticated user, preserving RLS
3. Validate the token with `supabase.auth.getUser()` — if it fails, return `401` before hitting Claude
4. Pass the authenticated Supabase client to tool executors for all database operations

This avoids needing a service role key and leverages existing RLS policies.

### Tool Definitions

Three tools for the MVP — search, save, and watchlist:

| Tool | Parameters | Description |
|------|-----------|-------------|
| `search_for_date` | `query: string` | Search the web for a confirmed date. Wraps existing `searchForDate()`. |
| `add_confirmed_date` | `title, date, confidence, source?, notes?, category?` | Insert into `confirmed_dates`. ID auto-generated (crypto.randomUUID). |
| `create_watchlist_item` | `title, type, category?, notes?` | Insert into `watchlist_items` with status `active`. For events without confirmed dates yet. |

The agent auto-infers `category` from context using the existing set: tech, sports, entertainment, gaming, birthday, travel, personal, business, holiday.

**Auto-save behavior:** The agent saves automatically for high/medium confidence results. For low confidence, it asks the user first. If `found: false`, it offers to create a watchlist item so the background process (`/pls-run`) can monitor for the date.

**Future tools (not in MVP):** `list_confirmed_dates`, `list_watchlist_items` — can be added incrementally.

### SSE Streaming Protocol

The response uses `text/event-stream` content type. Event types:

```
event: text_delta
data: {"text": "The NFL"}

event: tool_start
data: {"tool": "search_for_date", "input": {"query": "NFL draft 2026 date"}}

event: tool_result
data: {"tool": "search_for_date", "result": {"found": true, "date": "2026-04-23", ...}}

event: text_delta
data: {"text": "Draft is on April 23rd"}

event: done
data: {}

event: error
data: {"message": "Search service temporarily unavailable"}
```

The iOS client can use `tool_start` events to show "Searching..." indicators.

### Request/Response Contract

**Request:**
```
POST /chat
Authorization: Bearer <supabase-access-token>
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "When is the NFL draft this year?" }
  ]
}
```

- Messages follow Anthropic's format (role + content)
- Client sends only `user` and `assistant` messages — tool_use/tool_result are handled server-side
- Max body size: 1MB (Express json parser limit)

**Response:** SSE stream as described above.

### System Prompt

A focused prompt that defines behavior:
- Identity: "You are Goldfish, a date-tracking assistant"
- Available tools and when to use them
- Auto-save rules (high/medium → save, low → ask, not found → offer watchlist)
- Category inference from the predefined list
- Confidence model from agent/CLAUDE.md (high = official, medium = reputable press, low = rumors)
- Scope: date-related queries only — politely redirect off-topic questions
- Concise responses

### Safeguards

- **Tool loop cap:** Maximum 10 tool-call rounds per request to prevent runaway API costs
- **Request timeout:** 60 second total timeout per request
- **No list tools in MVP:** The agent can search, save, and create watchlist items, but cannot list/query existing data. List tools are a future addition.
- **Client disconnect:** Listen for `req.on('close')` and abort the Claude stream + tool execution
- **Rate limiting:** Defer to production — single-user MVP doesn't need it yet

## Technical Considerations

- **Model:** Use `claude-sonnet-4-5-20250514` for the orchestrator (same as search extraction — good balance of speed/capability for tool use)
- **Supabase client:** Create per-request using the user's JWT — no persistent connection pool needed for this scale
- **CORS:** Configure for the iOS app's origin. Start permissive (`*`) for development, tighten for production.
- **Brave rate limit:** 2 QPS on Brave Answers API. The tool-call loop naturally serializes searches, so this is unlikely to be hit in single-user scenarios.
- **Streaming gotcha:** From docs/plans/2026-03-06-fix-claude-stream-json-parsing-plan.md — use nested `event.type` from SDK stream events, not flat field checks. Track block index for concurrent text and tool_use blocks.

## Acceptance Criteria

- [x] Express server starts and listens on configurable port
- [x] `POST /chat` accepts messages array and streams SSE response
- [x] Authentication via Supabase JWT — rejects invalid/expired tokens with 401
- [x] `search_for_date` tool calls existing `searchForDate()` and returns structured result
- [x] `add_confirmed_date` tool inserts into `confirmed_dates` table as the authenticated user
- [x] `create_watchlist_item` tool inserts into `watchlist_items` table
- [x] Agent auto-saves high/medium confidence results, asks for low confidence
- [x] Agent offers watchlist creation when date not found
- [x] SSE events include `text_delta`, `tool_start`, `tool_result`, `done`, `error`
- [x] Tool loop capped at 10 iterations
- [x] Client disconnect aborts processing
- [x] CORS headers present on responses

## Implementation Phases

### Phase 1: Server Bootstrap
- Add `express`, `cors`, `@supabase/supabase-js` dependencies
- Create `backend/src/server.ts` — Express app with `/chat` route, CORS, JSON body parser (1MB limit)
- Extend `backend/src/lib/config.ts` to include `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- Auth middleware: extract JWT from Authorization header, create per-request Supabase client, validate with `supabase.auth.getUser()`
- Add `start` script to package.json

### Phase 2: Tool Definitions + Agent Loop
- Create `backend/src/agent/tools.ts` — tool definitions in Anthropic's tool-use schema format
- Create `backend/src/agent/tool-executor.ts` — function that takes a tool name + input, executes against services, returns result
- Create `backend/src/agent/loop.ts` — the agentic loop: call Claude with tools → execute tool calls → feed results back → repeat until `end_turn` or max iterations
- System prompt in `backend/src/agent/system-prompt.ts`

### Phase 3: SSE Streaming
- Wire the agent loop to stream events through the Express response
- Implement SSE event formatting (text_delta, tool_start, tool_result, done, error)
- Handle client disconnect via `req.on('close')`
- Handle errors gracefully — send error event, close stream

### Phase 4: Integration Testing
- Test with curl: send a message, verify SSE stream format
- Test auth: verify 401 on missing/invalid token
- Test tool execution: verify dates are written to Supabase
- Test edge cases: duplicate dates, unknown events, long conversations

## File Structure

```
backend/src/
  server.ts              # Express app entry point (NEW)
  index.ts               # Library exports (unchanged)
  search.ts              # Existing search service (unchanged)
  brave-answers.ts       # Existing Brave client (unchanged)
  agent/                 # NEW directory
    loop.ts              # Agentic tool-use loop
    tools.ts             # Tool definitions (Anthropic schema)
    tool-executor.ts     # Tool execution dispatcher
    system-prompt.ts     # System prompt for the chat agent
  lib/
    config.ts            # Add SUPABASE_URL, SUPABASE_ANON_KEY
    types.ts             # Existing types (unchanged)
    supabase.ts          # Per-request Supabase client factory (NEW)
```

## Dependencies & Risks

- **Anthropic API costs:** Each chat turn may trigger multiple Claude calls (orchestrator + search extraction). Monitor usage.
- **Brave API quota:** 2 QPS limit could become a bottleneck with concurrent users (not a concern for single-user MVP).
- **Token limits:** Long conversations sent stateless could exceed Claude's context window. May need to truncate older messages.

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-08-conversational-agent-api-brainstorm.md](docs/brainstorms/2026-03-08-conversational-agent-api-brainstorm.md) — Key decisions: Express in backend/, Anthropic SDK + tool use, stateless, Supabase only, SSE streaming
- **Streaming gotchas:** [docs/plans/2026-03-06-fix-claude-stream-json-parsing-plan.md](docs/plans/2026-03-06-fix-claude-stream-json-parsing-plan.md) — nested event type handling
- **Search service:** [backend/src/search.ts](backend/src/search.ts) — `searchForDate()` interface
- **Supabase patterns:** [cli/src/lib/supabase.ts](cli/src/lib/supabase.ts) — client setup, [cli/src/commands/date.ts](cli/src/commands/date.ts) — insert patterns
- **Agent rules:** [agent/CLAUDE.md](agent/CLAUDE.md) — confidence model, categories, resolution logic
- **Supabase learnings:** [docs/solutions/integration-issues/supabase-cli-date-management.md](docs/solutions/integration-issues/supabase-cli-date-management.md) — auth patterns, batch limits
