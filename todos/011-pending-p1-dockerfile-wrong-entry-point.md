---
status: pending
priority: p1
issue_id: "011"
tags: [code-review, architecture, deployment]
dependencies: []
---

# Dockerfile Runs Wrong Entry Point

## Problem Statement

The Dockerfile CMD runs `dist/index.js` which is the library barrel file (exports types and `searchForDate`). It does not start the Express server. Containerized deployments will start, export symbols, and exit immediately -- a silent deployment failure.

## Findings

- **Architecture Strategist**: Identified as Critical -- `CMD ["node", "dist/index.js"]` runs library exports, not the server.
- **Code Simplicity Reviewer**: Confirmed as a deployment blocker, not just a style issue.
- File: `backend/Dockerfile`, line 15
- Related: `backend/src/index.ts` only exports types; `backend/src/server.ts` starts Express.

## Proposed Solutions

### Option A: Fix CMD to point at server.js
- **Pros**: One-line fix, immediately correct
- **Cons**: None
- **Effort**: Small
- **Risk**: None

```dockerfile
CMD ["node", "dist/server.js"]
```

### Option B: Make index.ts the server entry point
- **Pros**: Aligns with package.json `main` field
- **Cons**: Loses library export separation
- **Effort**: Small
- **Risk**: Low

## Recommended Action

Option A -- simplest fix.

## Technical Details

- **Affected files**: `backend/Dockerfile`
- **Related files**: `backend/src/index.ts`, `backend/src/server.ts`, `backend/package.json`

## Acceptance Criteria

- [ ] Dockerfile CMD runs the Express server
- [ ] Container starts and listens on port 3000

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from code review | Barrel file vs server entry point mismatch |

## Resources

- Branch: `feat/backend-date-search`
