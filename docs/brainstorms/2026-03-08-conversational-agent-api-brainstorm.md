# Brainstorm: Conversational Agent API

**Date:** 2026-03-08
**Status:** Draft

## What We're Building

A conversational chat API that sits on top of the existing Goldfish services (date search, Supabase storage). Users interact with it through natural language — asking about upcoming dates, requesting searches, and managing their Goldfish account — and the agent orchestrates tool calls behind the scenes.

**Starting use case:** "When is the NFL draft this year?" — The agent searches for the date, responds with the answer, and adds it to the user's Goldfish account automatically.

## Why This Approach

**Express server in the existing `backend/` package** using the Anthropic SDK's tool-use API directly.

- The backend already has all the right dependencies (Anthropic SDK, Supabase types, search service)
- Adding Express is minimal overhead — one new entry point, a single `/chat` endpoint
- Tool definitions are TypeScript functions wrapping existing services (`searchForDate`, Supabase inserts)
- Keeps the codebase consolidated rather than spinning up a new package prematurely

### Alternatives Considered

1. **Separate `api/` package** — Clean separation but premature for current scope. Can extract later.
2. **Hono on serverless** — Cold starts hurt streaming UX. More deployment complexity than needed.
3. **Claude Agent SDK** — More abstraction than needed when the Anthropic SDK + tool use loop is straightforward.

## Key Decisions

1. **Interface:** Chat API endpoint (POST /chat) — first client will be the iOS app
2. **LLM engine:** Anthropic SDK with tool use — run the tool-use loop server-side
3. **State management:** Stateless per request — client sends full conversation context each time
4. **Storage:** Supabase only (no markdown files), but matching the full data model (type, search_queries, confidence_threshold, etc.)
5. **Streaming:** Full SSE streaming of tokens back to the client for responsive UX
6. **Architecture:** Add Express server to existing `backend/` package

## Agent Tools

The agent will have access to these tools (mapped to existing service functions):

| Tool | Description | Existing Code |
|------|-------------|---------------|
| `search_for_date` | Search the web for a confirmed date for an event | `searchForDate()` from `backend/src/search.ts` |
| `add_confirmed_date` | Add a confirmed date to the user's account | Supabase insert into `confirmed_dates` |
| `create_watchlist_item` | Add an item to the watchlist for ongoing monitoring | Supabase insert into `watchlist_items` |
| `resolve_watchlist_item` | Resolve a watchlist item with a confirmed date | Supabase insert + update (atomic) |

## Request/Response Shape

**Request:** `POST /chat`
```json
{
  "messages": [
    { "role": "user", "content": "When is the NFL draft this year?" }
  ]
}
```

**Response:** SSE stream with Claude's response tokens, including tool call results inlined in the conversation.

## Open Questions

None — all key decisions resolved during brainstorming.
