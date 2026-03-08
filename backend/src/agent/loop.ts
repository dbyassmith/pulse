import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Response } from "express";
import { getConfig } from "../lib/config.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { TOOL_DEFINITIONS } from "./tools.js";
import { executeTool } from "./tool-executor.js";

const MAX_TOOL_ROUNDS = 10;
const MODEL = "claude-sonnet-4-6";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
}

function sendSSE(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function runAgentLoop(
  messages: ChatMessage[],
  context: ToolContext,
  res: Response
) {
  const { anthropicApiKey } = getConfig();
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const today = new Date().toISOString().split("T")[0];
  const systemPrompt = `${SYSTEM_PROMPT}\nToday's date: ${today}`;

  // Build the conversation messages for the Anthropic API
  let apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let aborted = false;
  res.on("close", () => {
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

    // Collect the full response for building the next turn
    const toolUseBlocks: Array<{
      id: string;
      name: string;
      input: Record<string, unknown>;
    }> = [];
    let hasToolUse = false;

    for await (const event of stream) {
      if (aborted) {
        stream.abort();
        return;
      }

      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          hasToolUse = true;
          sendSSE(res, "tool_start", {
            tool: event.content_block.name,
          });
          toolUseBlocks.push({
            id: event.content_block.id,
            name: event.content_block.name,
            input: {},
          });
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          sendSSE(res, "text_delta", { text: event.delta.text });
        } else if (event.delta.type === "input_json_delta") {
          // Accumulate tool input JSON — we'll parse it from the final message
        }
      }
    }

    // Get the final message to extract complete tool inputs
    const finalMessage = await stream.finalMessage();

    if (!hasToolUse || finalMessage.stop_reason === "end_turn") {
      sendSSE(res, "done", {});
      return;
    }

    // Extract tool use blocks from the final message (has complete parsed input)
    const toolBlocks = finalMessage.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    // Add assistant message with full content to conversation
    apiMessages = [
      ...apiMessages,
      { role: "assistant" as const, content: finalMessage.content },
    ];

    // Execute each tool and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolBlocks) {
      if (aborted) return;

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
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Tool execution failed";
        sendSSE(res, "tool_result", {
          tool: block.name,
          error: errorMsg,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: errorMsg }),
          is_error: true,
        });
      }
    }

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
