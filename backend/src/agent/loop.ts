import Anthropic from "@anthropic-ai/sdk";
import type { Response } from "express";
import { getConfig } from "../lib/config.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { TOOL_DEFINITIONS } from "./tools.js";
import { executeTool, type ToolContext } from "./tool-executor.js";

const MAX_TOOL_ROUNDS = 10;
const MODEL = "claude-sonnet-4-6";
const LOOP_TIMEOUT_MS = 120_000;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Module-scope singleton Anthropic client (lazy-initialized)
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const { anthropicApiKey } = getConfig();
    anthropicClient = new Anthropic({ apiKey: anthropicApiKey });
  }
  return anthropicClient;
}

function sendSSE(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Query Supabase for a slim data summary to inject into the system prompt,
 * giving the agent awareness of the user's current data.
 */
async function buildContextSummary(context: ToolContext): Promise<string> {
  const today = new Date().toISOString().split("T")[0];

  const [datesResult, watchlistResult, upcomingResult] = await Promise.all([
    context.supabase
      .from("confirmed_dates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("date", today),
    context.supabase
      .from("watchlist_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("status", "active"),
    context.supabase
      .from("confirmed_dates")
      .select("title, date")
      .eq("user_id", context.userId)
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(3),
  ]);

  const dateCount = datesResult.count ?? 0;
  const watchlistCount = watchlistResult.count ?? 0;
  const upcoming = upcomingResult.data ?? [];

  let summary = `\n\nUser context: ${dateCount} upcoming confirmed date(s), ${watchlistCount} active watchlist item(s).`;
  if (upcoming.length > 0) {
    const items = upcoming
      .map((d: { title: string; date: string }) => `- ${d.title} (${d.date})`)
      .join("\n");
    summary += `\nNext upcoming:\n${items}`;
  }

  return summary;
}

export async function runAgentLoop(
  messages: ChatMessage[],
  context: ToolContext,
  res: Response
) {
  const client = getAnthropicClient();

  const today = new Date().toISOString().split("T")[0];
  const contextSummary = await buildContextSummary(context);
  const systemPrompt = `${SYSTEM_PROMPT}\nToday's date: ${today}${contextSummary}`;

  // Build the conversation messages for the Anthropic API
  let apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let aborted = false;
  res.on("close", () => {
    aborted = true;
  });

  // Overall loop timeout (120 seconds)
  const loopTimeout = AbortSignal.timeout(LOOP_TIMEOUT_MS);
  loopTimeout.addEventListener("abort", () => {
    aborted = true;
  });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (aborted) return;

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: apiMessages,
      tools: TOOL_DEFINITIONS,
    });

    for await (const event of stream) {
      if (aborted) {
        stream.abort();
        return;
      }

      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          sendSSE(res, "tool_start", {
            tool: event.content_block.name,
          });
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          sendSSE(res, "text_delta", { text: event.delta.text });
        }
      }
    }

    // Get the final message to extract complete tool inputs
    const finalMessage = await stream.finalMessage();

    // Extract tool use blocks from the final message (has complete parsed input)
    const toolBlocks = finalMessage.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (toolBlocks.length === 0 || finalMessage.stop_reason === "end_turn") {
      sendSSE(res, "done", {});
      return;
    }

    // Add assistant message with full content to conversation
    apiMessages = [
      ...apiMessages,
      { role: "assistant" as const, content: finalMessage.content },
    ];

    // Execute all tools in parallel and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolBlocks.map(async (block) => {
        try {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            context
          );
          sendSSE(res, "tool_result", {
            tool: block.name,
            result: JSON.parse(result),
          });
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: result,
          };
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "Tool execution failed";
          sendSSE(res, "tool_result", {
            tool: block.name,
            error: errorMsg,
          });
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: JSON.stringify({ error: errorMsg }),
            is_error: true as const,
          };
        }
      })
    );

    if (aborted) return;

    // Add tool results as user message
    apiMessages = [
      ...apiMessages,
      { role: "user" as const, content: toolResults },
    ];
  }

  // Hit max rounds
  sendSSE(res, "error", { message: "Maximum tool rounds exceeded" });
  sendSSE(res, "done", {});
}
