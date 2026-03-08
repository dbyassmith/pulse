import { getConfig } from "./lib/config.js";
import type { BraveAnswerResult, Citation } from "./lib/types.js";

const BRAVE_ANSWERS_URL = "https://api.search.brave.com/res/v1/chat/completions";

function parseCitations(text: string): { cleanText: string; citations: Citation[] } {
  const citations: Citation[] = [];
  const citationRegex = /<citation>([\s\S]*?)<\/citation>/g;

  let match;
  while ((match = citationRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      citations.push({
        url: parsed.url ?? "",
        snippet: parsed.snippet ?? "",
      });
    } catch {
      // Skip malformed citation tags
    }
  }

  const cleanText = text.replace(citationRegex, "").trim();

  return { cleanText, citations };
}

export async function queryBraveAnswers(question: string): Promise<BraveAnswerResult> {
  const { braveApiKey } = getConfig();

  const response = await fetch(BRAVE_ANSWERS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Subscription-Token": braveApiKey,
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: "brave",
      messages: [
        {
          role: "user",
          content: `What is the confirmed date for: ${question}`,
        },
      ],
      extra_body: {
        enable_citations: true,
      },
    }),
  });

  if (response.status === 429) {
    throw new Error(
      `Brave Answers API rate limited. Retry after ${response.headers.get("X-RateLimit-Reset") ?? "unknown"} seconds.`
    );
  }

  if (!response.ok) {
    throw new Error(`Brave Answers API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  const rawContent = data?.choices?.[0]?.message?.content ?? "";
  if (!rawContent) {
    return { answer: "", citations: [] };
  }

  const { cleanText, citations } = parseCitations(rawContent);

  return { answer: cleanText, citations };
}
