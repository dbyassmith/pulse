---
status: pending
priority: p1
issue_id: "012"
tags: [code-review, security, typescript]
dependencies: []
---

# No Input Validation on /chat Request Body

## Problem Statement

The `/chat` endpoint only checks that `messages` is a non-empty array. It does not validate element shape, role values, content types, or array/content length bounds. Malformed messages are passed directly to the Anthropic SDK. Since SSE headers are set before validation completes, clients get a 200 with SSE headers followed by error events -- a confusing failure mode.

## Findings

- **TypeScript Reviewer**: Messages shape not validated; accepts `[42, null, {role: "hacker"}]`
- **Security Sentinel** (H1): No bounds on array length or content size; enables token exhaustion
- File: `backend/src/server.ts`, lines 37-41 and 44-47

## Proposed Solutions

### Option A: Add Zod schema, validate before SSE headers
- **Pros**: Consistent with existing Zod usage; returns proper 400 before streaming
- **Cons**: None
- **Effort**: Small
- **Risk**: None

```typescript
const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(10_000),
  })).min(1).max(50),
});

// Validate BEFORE setting SSE headers
const parsed = ChatRequestSchema.safeParse(req.body);
if (!parsed.success) {
  res.status(400).json({ error: "Invalid request" });
  return;
}
// Then set SSE headers
```

## Recommended Action

Option A.

## Technical Details

- **Affected files**: `backend/src/server.ts`
- Move `ChatMessage` interface from `loop.ts` to a Zod schema in `types.ts`

## Acceptance Criteria

- [ ] Messages array elements validated for role and content type
- [ ] Array length and content size bounded
- [ ] Validation happens before SSE headers are sent
- [ ] Invalid requests return 400 JSON, not SSE error events

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from code review | Validate before switching to SSE response mode |

## Resources

- Branch: `feat/backend-date-search`
