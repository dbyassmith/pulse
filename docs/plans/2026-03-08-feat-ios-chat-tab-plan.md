---
title: "feat: iOS Chat Tab"
type: feat
status: completed
date: 2026-03-08
origin: docs/brainstorms/2026-03-08-conversational-agent-api-brainstorm.md
---

# feat: iOS Chat Tab

## Overview

Add a Chat tab to the Goldfish iOS app that connects to the backend `POST /chat` API. Users can ask about event dates conversationally — the agent searches, saves dates, and streams responses back in real-time via SSE.

(see brainstorm: docs/brainstorms/2026-03-08-conversational-agent-api-brainstorm.md — iOS app identified as first client)

## Problem Statement / Motivation

The backend chat API is built and working, but there's no client to use it. The iOS app is the primary interface for Goldfish users — adding a Chat tab gives them conversational access to the agent from their phone.

## Proposed Solution

Add a third tab ("Chat") to the existing TabView with a standard chat UI: message bubbles, text input, streaming text display, and tool activity indicators. A new `ChatService` handles SSE streaming via `URLSession.bytes(for:)`.

### Architecture

```
ChatView (@State messages, input)
    → ChatService.sendMessage(messages)
        → URLSession.bytes(for: POST /chat)
            → Parse SSE events line-by-line
            → Yield typed events back to view
                → Update message content in-place
```

### New Files

| File | Purpose |
|------|---------|
| `ChatView.swift` | Chat tab UI — message list, input bar, streaming display |
| `ChatService.swift` | SSE client — builds requests, parses stream, yields events |
| `ChatMessage.swift` | Message model — role, content, tool status |

### Configuration

Add `API_BASE_URL` following the existing config pattern:

1. `Secrets.xcconfig`: `API_BASE_URL = http://localhost:3000`
2. `Info.plist`: `<key>API_BASE_URL</key><string>$(API_BASE_URL)</string>`
3. Read via `Bundle.main.infoDictionary?["API_BASE_URL"]`

For development: add an ATS exception for localhost in Info.plist. Production will use HTTPS.

### Authentication

Extract the Supabase access token for the Bearer header:

```swift
let session = try await SupabaseService.shared.client.auth.session
let accessToken = session.accessToken
// Set Authorization: Bearer <accessToken> on the URLRequest
```

The Supabase Swift SDK auto-refreshes tokens when accessing `.session`. If `getUser()` fails (401 from backend), show an error in the chat and let the user retry.

### SSE Parsing

Parse `URLSession.bytes(for:).lines` into typed events:

```swift
enum ChatEvent {
    case textDelta(String)
    case toolStart(String)       // tool name
    case toolResult(String, Bool) // tool name, success
    case done
    case error(String)
}
```

Parse SSE format line-by-line: accumulate `event:` and `data:` fields, emit on blank line. Decode JSON data payload per event type.

### Chat UI Design

- **Message bubbles**: User = orange background + white text (right-aligned). Assistant = system gray5 (left-aligned).
- **Streaming text**: Append `text_delta` chunks to the assistant message content in-place. Auto-scroll to bottom as text arrives.
- **Tool indicators**: Show inline in the assistant bubble area. Map tool names to friendly labels:
  - `search_for_date` → "Searching..."
  - `add_confirmed_date` → "Saving date..."
  - `create_watchlist_item` → "Adding to watchlist..."
- **Input bar**: TextField with send button. During streaming, send button becomes a stop/cancel button. TextField stays enabled (user can type ahead) but send is replaced by stop.
- **Empty state**: Centered text "Ask about any upcoming event" with an example prompt.
- **Nav bar**: OrangeDot + "Chat" title + settings gear, matching other tabs.

### Conversation State

- **Ephemeral** — conversation lives in `@State`, lost on app restart. No persistence for MVP.
- **History accumulation**: Store `[{ role: "user"|"assistant", content: String }]`. Only store final text content (not tool events). Send full history with each request.
- **Cancellation**: User can tap stop button during streaming. This cancels the URLSession task, which closes the connection and triggers `req.on("close")` on the backend.

### Cross-Tab Data Freshness

When the agent saves a date or watchlist item via tool use, the Upcoming and Watchlist tabs won't reflect it until refreshed. Fix by changing those tabs from `.task { }` (runs once) to `.onAppear { }` (runs each time the tab appears).

## Technical Considerations

- **No new dependencies** — URLSession + native SSE parsing. No third-party libraries needed.
- **`@MainActor` safety** — ChatService is `@MainActor`. All state updates happen on the main thread. The `for try await` loop in URLSession inherits the actor context.
- **Task cancellation** — `.onDisappear` cancels any in-progress stream task. The `for try await` loop cooperatively throws `CancellationError`.
- **iOS 17+** — Use `.defaultScrollAnchor(.bottom)` for the scroll view. The app already targets iOS 17 (uses `ContentUnavailableView`).
- **App backgrounding** — Stream will be interrupted when backgrounded. On return, keep any partial text, show "Connection lost" if incomplete, re-enable input.
- **Long conversations** — No truncation for MVP. If the backend hits Claude's context limit, it will return an error event that the app displays.

## Acceptance Criteria

- [x] Chat tab appears in TabView with message bubble icon
- [x] User can type a message and send it
- [x] SSE stream connects with Bearer token auth
- [x] `text_delta` events stream text into assistant bubble in real-time
- [x] `tool_start` events show friendly tool activity indicator
- [x] `done` event re-enables input
- [x] `error` events display error message in chat
- [x] Cancel/stop button aborts in-progress stream
- [x] Auto-scroll to bottom during streaming
- [x] Conversation history sent with each request (multi-turn works)
- [x] 401 errors show "Session expired" message
- [x] Network errors show inline error with ability to retry
- [x] Upcoming/Watchlist tabs refresh data on appear (cross-tab freshness)
- [x] OrangeDot + "Chat" title in nav bar matches other tabs
- [x] API_BASE_URL configurable via Secrets.xcconfig

## Implementation Phases

### Phase 1: Config + ChatService Foundation
- Add `API_BASE_URL` to `Secrets.xcconfig`, `Info.plist`
- Add ATS exception for localhost in Info.plist
- Create `ChatMessage.swift` — model with id, role, content, toolStatus
- Create `ChatService.swift` — singleton `@MainActor` class with:
  - `sendMessage()` that builds URLRequest, extracts Bearer token, starts stream
  - SSE line parser that yields `ChatEvent` values
  - Task management (cancel support)

### Phase 2: ChatView UI
- Create `ChatView.swift` with:
  - Message list (ScrollView + LazyVStack + ScrollViewReader)
  - Message bubbles (user orange, assistant gray)
  - Tool activity indicators (inline labels with spinner)
  - Input bar with send/stop button
  - Empty state
- Add Chat tab to `ContentView.swift` TabView (tag 2, message bubble icon)
- Wire up OrangeDot nav bar

### Phase 3: Streaming Integration
- Wire ChatService → ChatView state updates
- Implement streaming text append (text_delta → update message content)
- Implement tool indicator display (tool_start → show label, tool_result → clear)
- Implement done/error handling
- Auto-scroll during streaming
- Cancel button wires to task cancellation

### Phase 4: Polish + Cross-Tab
- Change Upcoming/Watchlist tabs from `.task` to `.onAppear` for data freshness
- Handle 401 errors (show session expired message)
- Handle network errors (show inline error)
- Handle stream interruption (keep partial text, show error)
- Handle app backgrounding gracefully

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-08-conversational-agent-api-brainstorm.md](docs/brainstorms/2026-03-08-conversational-agent-api-brainstorm.md) — iOS identified as first client
- **Backend API plan:** [docs/plans/2026-03-08-feat-conversational-agent-chat-api-plan.md](docs/plans/2026-03-08-feat-conversational-agent-chat-api-plan.md) — SSE event format, tool definitions, auth flow
- **iOS tab pattern:** [ios/goldfish/goldfish/ContentView.swift](ios/goldfish/goldfish/ContentView.swift) — TabView structure (lines 26-38)
- **Service pattern:** [ios/goldfish/goldfish/SupabaseService.swift](ios/goldfish/goldfish/SupabaseService.swift) — @MainActor singleton, auth token access
- **View pattern:** [ios/goldfish/goldfish/WatchlistView.swift](ios/goldfish/goldfish/WatchlistView.swift) — simplest view to follow
- **Backend SSE:** [backend/src/agent/loop.ts](backend/src/agent/loop.ts) — sendSSE function, event format
- **Backend server:** [backend/src/server.ts](backend/src/server.ts) — POST /chat endpoint, auth validation
- **Apple docs:** URLSession.AsyncBytes for SSE streaming
- **SwiftUI scrolling:** .defaultScrollAnchor(.bottom) for iOS 17+
