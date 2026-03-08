---
title: Backend Date Search Service
type: brainstorm
status: draft
date: 2026-03-08
---

# Backend Date Search Service

## What We're Building

An importable TypeScript module in a new `backend/` folder that, given an event description (e.g., "WWDC 2026", "next GTA release"), searches the web and determines whether a confirmed date exists. It returns structured results including the date (if found), confidence level, source URL, and supporting details.

The service uses an **agentic loop** powered by the Anthropic SDK with tool use — Claude decides what to search, evaluates results, and can refine queries or search again if initial results are inconclusive.

## Why This Approach

**Importable module over HTTP server:** The two consumers (a separate agent and a scheduled worker) both live in the same monorepo and can import directly. No need for network overhead, deployment of a separate service, or managing HTTP concerns. Keeps things simple.

**Agentic loop over simple pipeline:** Date information is often ambiguous — rumors vs. confirmed announcements, multiple possible dates, vague "Q3 2026" ranges. Letting Claude iterate on searches and evaluate source credibility produces better results than a single-pass pipeline. The trade-off is higher cost/latency per query, but accuracy matters more here.

**Anthropic SDK + tool use over agent frameworks:** The loop is straightforward — search the web, read results, decide if more searching is needed, extract a final answer. The Anthropic SDK's tool use handles this natively without adding framework complexity.

## Key Decisions

1. **Location:** `backend/` folder at monorepo root, matching existing structure (cli/, desktop/, ios/, agent/)
2. **Language:** TypeScript with ESM, matching CLI patterns (ES2022 target, Node16 module resolution, strict mode)
3. **Package manager:** npm, consistent with the CLI
4. **LLM provider:** Anthropic (Claude) via `@anthropic-ai/sdk`
5. **Web search provider:** Brave Search API — good free tier (2k queries/month), returns structured results with titles/descriptions/URLs, easy to parse for LLM consumption
6. **Architecture:** Agentic tool-use loop. Define tools (`web_search`, `extract_date_info`) that Claude can call in a loop until it has enough information to produce a final answer
7. **Packaging:** Exported async function(s) that callers import directly — no HTTP server

## How It Works

```
searchForDate("WWDC 2026")
  │
  ├─ Build system prompt with date-finding instructions
  ├─ Start Anthropic tool-use loop:
  │    ├─ Claude generates search queries
  │    ├─ Tool: web_search(query) → Brave Search results
  │    ├─ Claude evaluates results
  │    ├─ (optional) Claude searches again with refined query
  │    └─ Claude produces final structured answer
  │
  └─ Return: { found: boolean, date?, confidence, source?, notes? }
```

## Return Shape

```typescript
interface DateSearchResult {
  found: boolean;
  date: string | null;        // ISO date string if found
  confidence: "confirmed" | "rumored" | "speculative" | "none";
  source: string | null;      // URL where date was found
  title: string;              // Event title as understood
  notes: string;              // Summary of findings
  queriesUsed: string[];      // Search queries that were executed
}
```

## Resolved Questions

1. **Max iterations:** 3 rounds max. Enough for initial search + 2 refinements, balances thoroughness vs. cost.
2. **Caching:** No caching for now. Keep the service stateless; consumers manage their own dedup.
3. **Cost controls:** The 3-round cap serves as implicit cost control. No per-query token budget needed initially.
