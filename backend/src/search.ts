import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getConfig } from "./lib/config.js";
import { DateSearchResultSchema, type DateSearchResult } from "./lib/types.js";
import { queryBraveAnswers } from "./brave-answers.js";

const EXTRACTION_SYSTEM_PROMPT = `You are a date extraction assistant. You will be given a web search answer about an event, along with source citations. Your job is to extract structured date information.

Rules:
- "found" should be true only if a specific date (day, month, year) is mentioned. A month-only or quarter-only mention (e.g., "June 2026" or "Q3 2026") does NOT count as found.
- "date" must be in ISO YYYY-MM-DD format. For multi-day events, use the START date.
- "confidence" reflects source authority:
  - "high": Date comes from an official/first-party source (the organization's own website, press release, or official announcement)
  - "medium": Date comes from reputable journalism or press coverage
  - "low": Date comes from rumors, leaks, or unverified sources
  - null: When found is false
- "source" is the most authoritative URL from the citations. null when found is false.
- "title" is the event name as you understand it from the search results.
- "notes" is a brief summary of findings. For multi-day events, include the full date range here. If no date was found, explain why (e.g., "Only a month was mentioned", "No date announced yet").`;

export async function searchForDate(query: string): Promise<DateSearchResult> {
  const { anthropicApiKey } = getConfig();

  const braveResult = await queryBraveAnswers(query);

  if (!braveResult.answer) {
    return {
      found: false,
      date: null,
      confidence: null,
      source: null,
      title: query,
      notes: "Brave Answers API returned no answer for this query.",
    };
  }

  const citationSummary = braveResult.citations.length > 0
    ? braveResult.citations
        .map((c, i) => `[${i + 1}] ${c.url}\n    ${c.snippet}`)
        .join("\n")
    : "No citations provided.";

  const userMessage = `Search answer for "${query}":

${braveResult.answer}

Sources:
${citationSummary}`;

  const client = new Anthropic({ apiKey: anthropicApiKey });

  const message = await client.messages.parse({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 1024,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    output_config: {
      format: zodOutputFormat(DateSearchResultSchema),
    },
  });

  const result = message.parsed_output;
  if (!result) {
    return {
      found: false,
      date: null,
      confidence: null,
      source: null,
      title: query,
      notes: "Claude extraction returned no structured output.",
    };
  }

  return result;
}
