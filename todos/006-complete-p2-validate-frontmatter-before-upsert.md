---
status: complete
priority: p2
issue_id: "006"
tags: [code-review, security, input-validation]
dependencies: []
---

# Validate and allowlist frontmatter fields before database upsert

## Problem Statement

The `sync --file` command reads frontmatter and upserts into Supabase. Without validation, malformed or malicious frontmatter could set `user_id` to another user, set `status` to `resolved` without going through the resolve flow, or inject unexpected values.

## Findings

- **Security Sentinel**: "Always set `user_id` from the authenticated session, never from the file. Always set `status` to `active` for sync operations."
- **Learnings Researcher**: Existing `date.ts` validates date format, confidence enum, and required fields before any Supabase call. Follow the same pattern.

## Proposed Solutions

In the `sync --file` handler:
- Destructure only expected fields from parsed frontmatter
- Set `user_id` from authenticated session (never from file)
- Set `status` based on presence of `resolved_date` (or always `active` for sync)
- Validate `type` against known enum values
- Validate `confidence_threshold` against `high|medium|low`
- Require `id` and `title` to be non-empty

- **Effort**: Small
- **Risk**: None

## Acceptance Criteria

- [ ] `user_id` always set from session, not frontmatter
- [ ] Only allowlisted fields extracted from frontmatter
- [ ] Required fields validated (id, title)
- [ ] Enum fields validated (type, confidence_threshold)

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from security review | Follow existing date.ts validation pattern |
