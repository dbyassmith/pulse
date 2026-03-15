---
status: pending
priority: p3
issue_id: "024"
tags: [code-review, security, llm]
dependencies: []
---

# Prompt Injection Mitigation for Brave Search Content

## Problem Statement

Brave Answers API returns web content injected directly into Claude prompts. A malicious website could plant content to manipulate the agent's tool-calling behavior (save incorrect dates, extract conversation info).

Additionally, iOS renders assistant messages as Markdown via `LocalizedStringKey`, making links tappable -- a phishing vector if the agent echoes attacker-controlled URLs.

## Findings

- **Security Sentinel** (M3): Indirect prompt injection via Brave results in `search.ts`
- **Security Sentinel** (L3): iOS Markdown link rendering concern in `ChatView.swift` line 88
- Files: `backend/src/search.ts` (lines 43-48), `ios/goldfish/goldfish/ChatView.swift` (line 88)

## Proposed Solutions

### Option A: Delineate untrusted content + plain text rendering
- Wrap Brave content in XML tags with instructions to treat as data only
- Use `Text(message.content)` instead of `Text(LocalizedStringKey(...))` on iOS
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] Brave search content clearly delineated in prompts
- [ ] iOS assistant messages don't render tappable links from untrusted sources

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from code review | LLM apps need untrusted content boundaries |
