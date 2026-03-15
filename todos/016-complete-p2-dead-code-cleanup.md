---
status: pending
priority: p2
issue_id: "016"
tags: [code-review, quality, typescript, swift]
dependencies: []
---

# Dead Code and Duplication Cleanup

## Problem Statement

Multiple reviewers identified dead code and duplicated types that should be cleaned up.

## Findings

1. **`toolUseBlocks` array** in `loop.ts` (lines 60-64, 79-83): Populated during streaming but never read. Tool blocks are extracted from `finalMessage.content` instead.
2. **`hasToolUse` flag** in `loop.ts` (line 65): Redundant with `toolBlocks.length` check.
3. **Duplicate `ToolContext` interface**: Defined identically in `loop.ts` (line 17) and `tool-executor.ts` (line 4).
4. **`ChatMessage.toolStatus` property** in `ChatMessage.swift` (line 7): Never assigned or read; `ChatView` tracks tool status separately via `@State`.

## Proposed Solutions

### Option A: Remove dead code, extract shared type
- **Effort**: Small
- **Risk**: None

## Acceptance Criteria

- [ ] `toolUseBlocks` array and push logic removed from `loop.ts`
- [ ] `hasToolUse` replaced with `toolBlocks.length > 0`
- [ ] `ToolContext` extracted to `types.ts`, imported in both files
- [ ] `toolStatus` property removed from `ChatMessage.swift`

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from code review | Multiple reviewers flagged the same dead code |
