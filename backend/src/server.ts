import express from "express";
import cors from "cors";
import { getConfig } from "./lib/config.js";
import { createAuthenticatedClient } from "./lib/supabase.js";
import { runAgentLoop } from "./agent/loop.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.post("/chat", async (req, res) => {
  // Extract auth token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }

  const accessToken = authHeader.slice(7);

  // Create authenticated Supabase client
  const supabase = createAuthenticatedClient(accessToken);

  // Validate the token
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
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
