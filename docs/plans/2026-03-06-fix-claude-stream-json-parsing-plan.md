---
title: "fix: Claude stream-json parsing shows no output"
type: fix
status: completed
date: 2026-03-06
---

# fix: Claude stream-json parsing shows no output

## Overview

The desktop app's Claude CLI integration shows only "Starting..." then "Done." with no intermediate progress or final result text. The root cause is that the stream-json parser in `desktop/src/main/index.ts` uses an incorrect event schema — it checks for flat fields like `event.type === 'assistant'` when the actual format is a `StreamEvent` wrapper containing nested Claude API events.

## Problem Statement / Motivation

The chat input is the core interaction surface of the desktop app. Without visible output, it's useless — users can't see what Claude is doing, what tools it's using, or what the final answer is. This blocks all of Phase 3's value.

## Proposed Solution

Rewrite the `parseClaudeEvent` function and the stdout handler in `spawnClaude` to match the actual `--output-format stream-json --verbose` envelope format.

### Actual Stream-JSON Format

Each line from stdout is a newline-delimited JSON object:

```json
{
  "type": "stream_event",
  "uuid": "...",
  "session_id": "...",
  "event": { /* Claude API streaming event */ },
  "parent_tool_use_id": null
}
```

The inner `event` uses standard Claude API streaming types:

| `event.type` | Purpose | Key fields |
|---|---|---|
| `message_start` | New message begins | `event.message.role` |
| `content_block_start` | New text or tool_use block | `event.content_block.type`, `.name` (for tools) |
| `content_block_delta` | Incremental content | `event.delta.type` (`text_delta` or `input_json_delta`), `event.delta.text` |
| `content_block_stop` | Block finished | `event.index` |
| `message_delta` | Stop reason | `event.delta.stop_reason` |
| `message_stop` | Message complete | — |

### What to surface in the UI

1. **Tool use progress** — When `content_block_start` has `content_block.type === "tool_use"`, show the tool name as a progress message (e.g., "Searching the web...", "Running command...")
2. **Streaming text** — Accumulate `text_delta` events into the result text. Show it live in the result card as it streams.
3. **Final result** — On `message_stop`, display the accumulated text as the final result card.
4. **Tool input details** — Accumulate `input_json_delta` for tool_use blocks to show what command is being run (e.g., "Running: goldfish date add --title ...")

### Changes Required

#### `desktop/src/main/index.ts`

**`spawnClaude` function** — rewrite stdout handler:

```typescript
child.stdout?.on('data', (data: Buffer) => {
  buffer += data.toString()
  const lines = buffer.split('\n')
  buffer = lines.pop() ?? ''

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const streamEvent = JSON.parse(line)
      if (streamEvent.type !== 'stream_event') continue
      const apiEvent = streamEvent.event
      // ... parse apiEvent by type
    } catch { /* skip non-JSON */ }
  }
})
```

**`parseClaudeEvent` function** — rewrite to handle actual API event types:

- `content_block_start` with `content_block.type === "tool_use"` → emit progress with tool name
- `content_block_delta` with `delta.type === "text_delta"` → emit streaming text
- `content_block_delta` with `delta.type === "input_json_delta"` → accumulate tool input JSON
- `content_block_stop` for tool blocks → emit progress with parsed tool input (e.g., show the bash command)
- `message_stop` → emit done signal

**New event types for renderer:**

Currently `ClaudeEvent` has `type: 'progress' | 'result'`. Expand to:

```typescript
interface ClaudeEvent {
  type: 'progress' | 'text' | 'result'
  text: string
}
```

- `progress` — tool use status messages (shown in progress bar)
- `text` — streaming assistant text (shown in result card as it arrives)
- `result` — final accumulated text on completion

#### `desktop/src/preload/index.ts`

No changes needed — the `claude:progress` and `claude:done` IPC channels already work.

#### `desktop/src/renderer/src/components/Dashboard.tsx`

- Show streaming text in the result card as `text` events arrive (not just on completion)
- Keep the progress bar for tool use messages
- On `claude:done`, finalize the result card

#### `desktop/src/renderer/src/components/ResultCard.tsx`

No structural changes needed — it already displays text. May want to add a "streaming" visual indicator (e.g., blinking cursor) while text is still arriving.

## Acceptance Criteria

- [x] Tool use events show meaningful progress messages ("Searching the web...", "Running: goldfish date add ...")
- [x] Assistant text streams into the result card in real-time as tokens arrive
- [x] Final result shows the complete assistant response
- [x] Errors from Claude subprocess still display correctly
- [x] Bash tool progress shows the actual command being run (parsed from input_json_delta)
- [x] Multiple tool calls in sequence each show their own progress message

## Technical Considerations

- **State tracking**: Need to track `currentToolName` and `currentToolInput` across `content_block_start` → multiple `content_block_delta` → `content_block_stop` events, since tool input JSON arrives in chunks
- **Block index tracking**: Use the `index` field to distinguish between concurrent text and tool_use blocks
- **Buffer management**: The existing line-splitting buffer approach is correct — keep it
- **No `--include-partial-messages` needed**: We don't need the redundant aggregated snapshots — just the raw stream events with `--verbose`

## Sources & References

### Internal References

- Current parser: `desktop/src/main/index.ts:140-170` (the `parseClaudeEvent` function)
- Dashboard consumer: `desktop/src/renderer/src/components/Dashboard.tsx`

### External References

- [Claude Code CLI reference (--output-format stream-json)](https://code.claude.com/docs/en/cli-reference)
- [Claude Code headless/programmatic usage](https://code.claude.com/docs/en/headless)
- [Claude API streaming events](https://platform.claude.com/docs/en/build-with-claude/streaming)
