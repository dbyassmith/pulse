---
status: pending
priority: p3
issue_id: "022"
tags: [code-review, architecture, quality]
dependencies: ["011"]
---

# Dual Entry Point Confusion + Test File Cleanup

## Problem Statement

1. `index.ts` is a library barrel file, `server.ts` is the app entry point. `package.json` has conflicting scripts: `dev` runs `index.ts` (does nothing), `start` runs `server.ts`.
2. `test-search.ts` is a dev throwaway that will be compiled into production `dist/`.

## Findings

- **Architecture Strategist**: Dual entry point creates ambiguity; `dev` script runs wrong file
- **Code Simplicity Reviewer**: Barrel file is YAGNI if nothing consumes the package as a library
- **Security Sentinel** (L1): Test file provides unauthenticated API access if included in build
- Files: `backend/src/index.ts`, `backend/package.json`, `backend/src/test-search.ts`

## Proposed Solutions

### Option A: Consolidate entry points + exclude test file
- Have `index.ts` start the server (or rename `server.ts` to `index.ts`)
- Move `test-search.ts` to `scripts/` or add to `.dockerignore`
- Fix `dev` script in package.json
- **Effort**: Small

## Acceptance Criteria

- [ ] Single clear entry point
- [ ] `dev` and `start` scripts both work correctly
- [ ] Test file excluded from production build

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from code review | Clarity in entry points prevents deployment confusion |
