---
title: Sliding Chat Pane for Message Interaction
type: feat
status: completed
date: 2026-03-07
---

# Sliding Chat Pane for Message Interaction

## Overview

Replace the inline ResultCard + progress bar with a full-height sliding pane that presents the interaction as a chat thread. When the user sends a message, the pane slides up from the bottom, showing the user's message, real-time status updates, and Claude's streamed response as distinct message bubbles.

## Problem Statement / Motivation

Currently, sending a message shows results inline within the dashboard as a small card and a progress bar. This feels disconnected — the user's original prompt disappears, status updates are a single line, and the response is crammed into a 200px-max card. A dedicated chat pane creates a focused, conversational experience that clearly associates the prompt with its response.

## Proposed Solution

A new `ChatPane` component that:
1. Slides up from the bottom (CSS transform transition) when a message is sent
2. Displays the conversation as a vertical thread of message bubbles:
   - **User message** — right-aligned, dark background
   - **Status messages** — center-aligned, subtle/muted, updated in-place as tools change
   - **Claude response** — left-aligned, streaming with cursor, then final text
3. Stays open until the user dismisses it via a close button or drag-down gesture
4. Single-turn only — one prompt, one response per pane session

## Technical Considerations

### Architecture

- **New file:** `desktop/src/renderer/src/components/ChatPane.tsx` — the sliding pane container + message rendering
- **Modified:** `desktop/src/renderer/src/components/Dashboard.tsx` — orchestrate pane visibility, move progress/result state into pane
- **No changes needed** to main process (`index.ts`) or preload (`preload/index.ts`) — IPC events stay the same

### State Flow

Dashboard already tracks `running`, `progress`, `streamingText`, and `result`. The change is purely presentational:

1. `handleSend` sets `running=true` and stores the user's prompt in new state `userPrompt`
2. `showPane=true` triggers the ChatPane to slide up
3. Progress events (`type: 'progress'`) append to a `statusMessages: string[]` array (or replace the last entry for same-tool updates)
4. Text events (`type: 'text'`) flow to the Claude response bubble
5. `claude:done` finalizes the response bubble
6. User dismisses pane → `showPane=false`, state resets

### Animation

- Use CSS `transform: translateY(100%)` → `translateY(0)` with `transition: transform 0.3s ease-out`
- Pane is always mounted but off-screen when hidden (avoids mount/unmount flash)
- Backdrop overlay with `opacity` transition for the dim effect

### Styling Convention

- Continue using inline styles (consistent with existing codebase)
- Match existing color palette: `#F8EDD9` background, `#1a1a1a` text, `#3498db` streaming accent

## Acceptance Criteria

- [x] Sending a message slides up a full-height pane over the dashboard
- [x] User's original message appears as a right-aligned bubble at the top
- [x] Tool/status progress appears as muted center messages, updating as tools change
- [x] Claude's streaming response appears as a left-aligned bubble with typing cursor
- [x] After Claude finishes, the response bubble shows final text (no cursor)
- [x] Close button (top-right) dismisses the pane with a slide-down animation
- [x] Error responses display in the Claude bubble with error styling (red accent)
- [x] Cancel button is accessible during the run to kill the Claude process
- [x] After dismissal, the dates list refreshes (existing `refreshKey` behavior preserved)
- [x] ChatInput remains visible at the bottom of the dashboard (below the pane or peeking out) so users know where to type next

## Success Metrics

- The interaction flow feels like a focused chat conversation rather than scattered inline elements
- Animation is smooth (60fps CSS transitions, no JS-driven animation)

## Dependencies & Risks

- **No new dependencies** — pure React + CSS transitions
- **Risk:** Pane height on short windows — mitigate with `min-height` and scrollable message area
- **Risk:** Long Claude responses — message area must scroll, auto-scroll to bottom on new content

## MVP

### ChatPane.tsx (new file)

```tsx
// desktop/src/renderer/src/components/ChatPane.tsx

interface ChatPaneProps {
  visible: boolean
  userMessage: string
  statusMessages: string[]
  responseText: string
  streaming: boolean
  error?: string
  onClose: () => void
  onCancel: () => void
}

function ChatPane({
  visible,
  userMessage,
  statusMessages,
  responseText,
  streaming,
  error,
  onClose,
  onCancel
}: ChatPaneProps): JSX.Element {
  // Auto-scroll message area on new content
  // Close button top-right
  // Cancel button visible while streaming
  // Message bubbles: user (right), status (center), claude (left)
}
```

### Dashboard.tsx changes

```tsx
// Add to Dashboard state:
const [userPrompt, setUserPrompt] = useState('')
const [showPane, setShowPane] = useState(false)
const [statusMessages, setStatusMessages] = useState<string[]>([])

// In handleSend:
setUserPrompt(prompt)
setShowPane(true)
setStatusMessages([])

// In progress handler:
if (event.type === 'progress') {
  setStatusMessages(prev => [...prev, event.text])
}

// In handleDismiss:
setShowPane(false)
setUserPrompt('')
setStatusMessages([])
setResult(null)
setRefreshKey(k => k + 1)

// Render ChatPane instead of inline ResultCard + progressBar
<ChatPane
  visible={showPane}
  userMessage={userPrompt}
  statusMessages={statusMessages}
  responseText={running ? streamingText : (result?.text ?? '')}
  streaming={running}
  error={result?.error}
  onClose={handleDismiss}
  onCancel={handleCancel}
/>
```

## Sources

- Existing components: `desktop/src/renderer/src/components/Dashboard.tsx`, `ResultCard.tsx`, `ChatInput.tsx`
- IPC events: `claude:progress` (type: progress | text), `claude:done` (text + error)
- Main process: `desktop/src/main/index.ts` (spawnClaude, event streaming)
