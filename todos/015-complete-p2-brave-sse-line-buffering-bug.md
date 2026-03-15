---
status: pending
priority: p2
issue_id: "015"
tags: [code-review, typescript, correctness]
dependencies: []
---

# SSE Line Parsing Bug in brave-answers.ts

## Problem Statement

The SSE reader splits on `\n` per chunk, but SSE data lines can be split across TCP chunks. If a chunk boundary falls mid-line, `JSON.parse` fails silently and content is lost.

## Findings

- **TypeScript Reviewer** (Important #4): Well-known SSE parsing pitfall; data loss on chunk boundaries
- File: `backend/src/brave-answers.ts`, lines 35-56

## Proposed Solutions

### Option A: Accumulate a line buffer across chunks
- **Pros**: Correct SSE parsing; standard pattern
- **Cons**: Slightly more code
- **Effort**: Small
- **Risk**: None

```typescript
let buffer = "";
for await (const chunk of body) {
  buffer += decoder.decode(chunk as Buffer, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) { /* process complete lines */ }
}
```

## Acceptance Criteria

- [ ] SSE lines split across chunks are correctly reassembled
- [ ] No silent data loss on chunk boundaries

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from code review | Always buffer SSE/streaming line parsing |
