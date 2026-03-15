import express from "express";
import cors from "cors";
import { getConfig } from "./lib/config.js";
import { createAuthenticatedClient } from "./lib/supabase.js";
import { runAgentLoop } from "./agent/loop.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  try {
    const { supabaseUrl, supabaseAnonKey } = getConfig();
    // Test direct fetch to Supabase auth endpoint
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey },
    });
    const body = await response.text();
    res.json({
      status: "ok",
      supabaseReachable: response.ok,
      supabaseStatus: response.status,
      supabaseBody: body.slice(0, 200),
    });
  } catch (err) {
    res.json({ status: "error", error: String(err) });
  }
});

app.post("/chat", async (req, res) => {
  // Extract auth token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }

  const accessToken = authHeader.slice(7);

  // Create authenticated Supabase client
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  console.log("Supabase config:", {
    url: supabaseUrl,
    keyLength: supabaseAnonKey.length,
    keyValue: supabaseAnonKey,
  });
  const supabase = createAuthenticatedClient(accessToken);

  // Validate the token by passing it directly to getUser
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    console.error("Auth failed:", { authError, hasUser: !!user, tokenPrefix: accessToken.slice(0, 20) + "..." });
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Validate request body
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }

  // Set up SSE response
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    await runAgentLoop(messages, { supabase, userId: user.id }, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    res.write(`event: done\ndata: {}\n\n`);
  }

  res.end();
});

const { port } = getConfig();
app.listen(port, () => {
  console.log(`Goldfish agent API listening on port ${port}`);
});
