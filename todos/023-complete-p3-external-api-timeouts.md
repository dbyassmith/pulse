---
status: pending
priority: p3
issue_id: "023"
tags: [code-review, performance, reliability]
dependencies: []
---

# Add Timeouts to External API Calls

## Problem Statement

No timeout on Brave API `fetch()` or overall agent loop. If Brave or Anthropic API hangs, the SSE connection stays open indefinitely and the iOS client shows "Searching..." forever.

## Findings

- **Architecture Strategist**: No `AbortSignal` on Brave fetch
- **Performance Oracle**: Agent loop can run 30-60 seconds with no overall cap
- **Security Sentinel** (L4): No request timeout on agent loop
- File: `backend/src/brave-answers.ts` (fetch call), `backend/src/agent/loop.ts`

## Proposed Solutions

### Option A: AbortSignal.timeout on fetch + overall loop timeout
- **Effort**: Small
- **Risk**: None

```typescript
const response = await fetch(url, {
  signal: AbortSignal.timeout(30_000),
  ...
});
```

## Acceptance Criteria

- [ ] Brave API calls timeout after 30 seconds
- [ ] Agent loop has overall timeout (e.g., 120 seconds)
- [ ] Timeouts produce clear error messages to client

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from code review | External API calls need timeouts |
