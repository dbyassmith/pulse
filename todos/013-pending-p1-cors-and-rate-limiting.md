---
status: pending
priority: p1
issue_id: "013"
tags: [code-review, security]
dependencies: []
---

# Wide-Open CORS and No Rate Limiting

## Problem Statement

1. `cors()` with no options allows any origin to make authenticated requests -- effectively disabling CSRF protection.
2. No rate limiting on `/chat`. Each request can trigger up to 10 Claude API rounds + Brave API calls. A single user can exhaust API quotas and incur significant costs.

## Findings

- **Security Sentinel** (C1): Any website can make cross-origin requests to the API
- **Security Sentinel** (C2): No rate limiting enables API quota exhaustion and cost attacks
- **Performance Oracle**: No rate limiting or concurrency control identified as critical scaling bottleneck
- File: `backend/src/server.ts`, lines 9-10

## Proposed Solutions

### Option A: Add CORS origin allowlist + express-rate-limit
- **Pros**: Industry standard, straightforward
- **Cons**: Need to maintain origin list
- **Effort**: Small
- **Risk**: None

```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: ['POST'],
}));

app.use('/chat', rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => /* user ID from auth */,
}));
```

### Option B: Also add concurrency semaphore
- **Pros**: Prevents upstream API exhaustion even within rate limits
- **Cons**: More complexity
- **Effort**: Medium
- **Risk**: Low

## Recommended Action

Option A for now; Option B when scaling.

## Technical Details

- **Affected files**: `backend/src/server.ts`, `backend/package.json`
- Add `express-rate-limit` dependency
- Add `ALLOWED_ORIGINS` to `.env.example`

## Acceptance Criteria

- [ ] CORS restricted to configured origins
- [ ] Per-user rate limiting on /chat endpoint
- [ ] Rate limit returns 429 with clear error message

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from code review | Cost protection is critical for LLM-backed APIs |

## Resources

- Branch: `feat/backend-date-search`
