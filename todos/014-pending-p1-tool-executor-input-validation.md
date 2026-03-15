---
status: pending
priority: p1
issue_id: "014"
tags: [code-review, security, typescript]
dependencies: []
---

# Tool Executor Has No Runtime Input Validation

## Problem Statement

Every tool handler in `tool-executor.ts` blindly casts `Record<string, unknown>` with `as`. If Claude returns a malformed tool call, `slugify` receives `undefined` which coerces to the string `"undefined"`, silently inserting a row with `id: "undefined"` into the database. No Zod validation despite Zod being a project dependency.

## Findings

- **TypeScript Reviewer** (Critical #1): Pervasive `as` casting; `slugify(undefined)` produces `"undefined"` as an ID
- **Security Sentinel** (M2): Tool inputs from Claude model passed to Supabase without type verification
- File: `backend/src/agent/tool-executor.ts`, lines 16, 36, 44-46, 65-73

## Proposed Solutions

### Option A: Add Zod schemas for each tool input
- **Pros**: Consistent with project; catches malformed inputs; eliminates all `as` casts
- **Cons**: ~30 lines of schema code
- **Effort**: Small
- **Risk**: None

```typescript
const AddConfirmedDateInput = z.object({
  title: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().optional(),
  notes: z.string().optional(),
  category: z.string().optional(),
});
```

## Recommended Action

Option A.

## Technical Details

- **Affected files**: `backend/src/agent/tool-executor.ts`
- Also eliminates the duplicate `ToolContext` interface (extract to `types.ts`)

## Acceptance Criteria

- [ ] All tool inputs validated with Zod before execution
- [ ] No `as` type assertions on tool inputs
- [ ] Malformed inputs return structured error to the agent
- [ ] Date format validated as YYYY-MM-DD

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from code review | LLM outputs need runtime validation at the boundary |

## Resources

- Branch: `feat/backend-date-search`
