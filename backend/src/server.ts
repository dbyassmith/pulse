import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { getConfig } from "./lib/config.js";
import { createAuthenticatedClient } from "./lib/supabase.js";
import { verifyCronSecret } from "./lib/cron-auth.js";
import { runAgentLoop } from "./agent/loop.js";
import { runWatchlistSweep } from "./watchlist-runner.js";

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "1mb" }));

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const cronLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many cron requests" },
});

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(32_000),
});

const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(100),
});

app.post("/cron/run-watchlist", cronLimiter, async (req, res) => {
  console.log(`[cron] /cron/run-watchlist hit from ${req.ip} at ${new Date().toISOString()}`);
  const { cronSecret } = getConfig();
  if (!verifyCronSecret(req.headers.authorization, cronSecret)) {
    console.warn("[cron] rejected: invalid or missing CRON_SECRET");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  console.log("[cron] starting watchlist sweep");
  try {
    const summary = await runWatchlistSweep();
    console.log(JSON.stringify({ kind: "watchlist-run", ...summary }));
    res.json(summary);
  } catch (err) {
    console.error("[cron] watchlist run error:", err);
    res.status(500).json({ error: "Watchlist run failed" });
  }
});

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
    console.error("Health check error:", err);
    res.json({ status: "error", error: "Health check failed" });
  }
});

app.post("/chat", chatLimiter, async (req, res) => {
  // Extract auth token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }

  const accessToken = authHeader.slice(7);

  // Create authenticated Supabase client
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

  // Validate request body with Zod (before setting SSE headers)
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  const { messages } = parsed.data;

  // Set up SSE response
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    await runAgentLoop(messages, { supabase, userId: user.id }, res);
  } catch (err) {
    console.error("Chat error:", err);
    res.write(`event: error\ndata: ${JSON.stringify({ message: "Internal server error" })}\n\n`);
    res.write(`event: done\ndata: {}\n\n`);
  }

  res.end();
});

const { port } = getConfig();
app.listen(port, () => {
  console.log(`Goldfish agent API listening on port ${port}`);
});
