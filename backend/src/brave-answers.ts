import { getConfig } from "./lib/config.js";
import type { BraveAnswerResult, Citation } from "./lib/types.js";

const BRAVE_ANSWERS_URL = "https://api.search.brave.com/res/v1/chat/completions";
const BRAVE_FETCH_TIMEOUT_MS = 30_000;

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

async function readSSEResponse(response: Response): Promise<string> {
  const body = response.body;
  if (!body) return "";

  const decoder = new TextDecoder();
  let fullContent = "";

  let buffer = "";

  for await (const chunk of body) {
    buffer += decoder.decode(chunk as Buffer, { stream: true });
    const parts = buffer.split("\n");

    // Last element may be an incomplete line; keep it in the buffer
    buffer = parts.pop() ?? "";

    for (const line of parts) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
        }
      } catch {
        // Skip malformed SSE data
      }
    }
  }

  // Process any remaining complete line left in the buffer
  if (buffer.trim().startsWith("data: ")) {
    const data = buffer.trim().slice(6).trim();
    if (data !== "[DONE]") {
      try {
        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
        }
      } catch {
        // Skip malformed SSE data
      }
    }
  }

  return fullContent;
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
      stream: true,
      enable_citations: true,
      messages: [
        {
          role: "user",
          content: `What is the confirmed date for: ${question}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(BRAVE_FETCH_TIMEOUT_MS),
  });

  if (response.status === 429) {
    console.error("Brave API rate limited:", response.headers.get("X-RateLimit-Reset"));
    throw new Error("Search service is temporarily unavailable. Please try again later.");
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error("Brave API error:", { status: response.status, statusText: response.statusText, body: errorBody });
    throw new Error("Search service error");
  }

  const rawContent = await readSSEResponse(response);
  if (!rawContent) {
    return { answer: "", citations: [] };
  }

  const { cleanText, citations } = parseCitations(rawContent);

  return { answer: cleanText, citations };
}
