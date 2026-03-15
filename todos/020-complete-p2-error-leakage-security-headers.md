---
status: pending
priority: p2
issue_id: "020"
tags: [code-review, security]
dependencies: []
---

# Error Messages Leak Internal Details + Missing Security Headers

## Problem Statement

1. Supabase errors, Brave API error bodies, and Anthropic SDK errors are passed through to the client, revealing internal infrastructure details (table names, column constraints, API URLs).
2. No `helmet` middleware -- missing `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc.

## Findings

- **Security Sentinel** (M1): Error messages leak internal details in server.ts, tool-executor.ts, brave-answers.ts
- **Security Sentinel** (H3): No security headers configured
- Files: `backend/src/server.ts` (lines 51-55), `backend/src/agent/tool-executor.ts` (lines 49-50), `backend/src/brave-answers.ts` (lines 90-91)

## Proposed Solutions

### Option A: Generic client errors + helmet
- **Pros**: Standard security hardening
- **Effort**: Small
- **Risk**: None

## Acceptance Criteria

- [ ] Error messages sent to client are generic
- [ ] Detailed errors logged server-side
- [ ] Helmet middleware added with sensible defaults

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from code review | Defense in depth for error handling |
