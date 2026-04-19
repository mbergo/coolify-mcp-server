/**
 * coolify-11d SSE connector.
 *
 * Wraps the same MCP server used by the stdio entry behind an Express +
 * SSE transport, and serves a setup UI on port 3111 by default.
 *
 * Routes:
 *   GET  /                  → setup UI (static HTML)
 *   GET  /api/status        → { connected, scope, lastRequestAt, errorCount, ... }
 *   POST /api/config        → update COOLIFY_BASE_URL / COOLIFY_TOKEN in-process
 *   POST /api/test          → validate a candidate base_url + token pair
 *   GET  /api/tools         → catalog of registered MCP tools
 *   GET  /mcp/sse           → MCP SSE transport (event-stream)
 *   POST /messages?sessionId= → MCP SSE client→server messages
 *
 * Auth: `Authorization: Bearer <CONNECTOR_AUTH_TOKEN>` required on every
 * path except '/' and '/api/status'. Missing env var → bind to 127.0.0.1 only.
 */

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { type Request, type Response } from "express";
import { CoolifyApiClient } from "../core/api-client.js";
import { probeTokenScope } from "../core/auth.js";
import { resolveConfig } from "../core/config.js";
import { createMcpServer } from "../mcp/bootstrap.js";
import { makeAuthMiddleware } from "./middleware/auth.js";

// ----------------------------------------------------------------
// State
// ----------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3111);
const AUTH_TOKEN = process.env.CONNECTOR_AUTH_TOKEN || null;
const BIND_HOST = AUTH_TOKEN ? "0.0.0.0" : "127.0.0.1";

interface RuntimeConfig {
  baseUrl: string;
  token: string;
}

// In-process overrides for POST /api/config. Env vars still win at startup.
let runtime: RuntimeConfig | null = null;

function effectiveConfig(): RuntimeConfig {
  if (runtime) return runtime;
  return {
    baseUrl: process.env.COOLIFY_BASE_URL ?? "",
    token: process.env.COOLIFY_TOKEN ?? "",
  };
}

const state = {
  lastRequestAt: null as string | null,
  errorCount: 0,
};

// ----------------------------------------------------------------
// Static UI loader (works in dev from src/ or prod from dist/)
// ----------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadUiHtml(): string {
  const candidates = [
    join(__dirname, "ui/index.html"),
    join(__dirname, "../../src/connector/ui/index.html"),
    join(__dirname, "../src/connector/ui/index.html"),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      /* next */
    }
  }
  return "<!doctype html><title>coolify-11d</title><p>setup UI not bundled</p>";
}

// ----------------------------------------------------------------
// MCP server — single instance shared across SSE sessions
// ----------------------------------------------------------------

const mcpServer = createMcpServer();

// ----------------------------------------------------------------
// Express
// ----------------------------------------------------------------

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(makeAuthMiddleware({ token: AUTH_TOKEN }));

app.use((_req, _res, next) => {
  state.lastRequestAt = new Date().toISOString();
  next();
});

// ---- UI ----
app.get("/", (_req, res) => {
  res.type("html").send(loadUiHtml());
});

// ---- /api/status ----
app.get("/api/status", (_req, res) => {
  const cfg = effectiveConfig();
  res.json({
    status: "ok",
    version: "0.1.0",
    authRequired: Boolean(AUTH_TOKEN),
    boundHost: BIND_HOST,
    coolifyBaseUrl: cfg.baseUrl,
    configured: Boolean(cfg.baseUrl && cfg.token),
    lastRequestAt: state.lastRequestAt,
    errorCount: state.errorCount,
    uptimeSeconds: Math.round(process.uptime()),
    mcpSseEndpoint: "/mcp/sse",
  });
});

// ---- /api/config (save new Coolify creds in-process) ----
app.post("/api/config", (req, res) => {
  const { base_url, token } = (req.body ?? {}) as { base_url?: string; token?: string };
  if (!base_url || !token) {
    res.status(400).json({ error: "base_url and token are required" });
    return;
  }
  if (!/^https?:\/\//.test(base_url)) {
    res.status(400).json({ error: "base_url must start with http:// or https://" });
    return;
  }
  runtime = { baseUrl: base_url.replace(/\/+$/, ""), token };
  res.json({ saved: true, base_url: runtime.baseUrl });
});

// ---- /api/test (dry-run probe + save on success) ----
app.post("/api/test", async (req, res) => {
  const { base_url, token } = (req.body ?? {}) as { base_url?: string; token?: string };
  if (!base_url || !token) {
    res.status(400).json({ error: "base_url and token are required" });
    return;
  }
  const client = new CoolifyApiClient({ baseUrl: base_url, token });
  try {
    const [health, version] = await Promise.all([client.health(), client.version()]);
    const probe = await probeTokenScope(client);
    runtime = { baseUrl: base_url.replace(/\/+$/, ""), token };
    res.json({
      ok: true,
      health,
      version,
      scope: probe.scope,
      canRead: probe.canRead,
      canReadSensitive: probe.canReadSensitive,
      canWrite: probe.canWrite,
      apiEnabled: probe.apiEnabled,
      notes: probe.notes,
    });
  } catch (err) {
    state.errorCount++;
    res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// ---- /api/tools (catalog for the setup UI) ----
app.get("/api/tools", async (_req, res) => {
  // McpServer doesn't expose its tool registry publicly; we read the
  // internal SDK state. `_registeredTools` is a plain object keyed by
  // tool name. Cast is deliberate.
  const internal = mcpServer as unknown as {
    _registeredTools?: Record<string, { description?: string; title?: string }>;
  };
  const registry = internal._registeredTools ?? {};
  const tools = Object.entries(registry)
    .map(([name, meta]) => ({
      name,
      title: meta?.title,
      description: meta?.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ count: tools.length, tools });
});

// ---- /mcp/sse + /messages (MCP SSE transport) ----
const sseTransports = new Map<string, SSEServerTransport>();

app.get("/mcp/sse", async (_req: Request, res: Response) => {
  // SSEServerTransport writes its own headers on first message.
  const transport = new SSEServerTransport("/messages", res);
  sseTransports.set(transport.sessionId, transport);
  res.on("close", () => {
    sseTransports.delete(transport.sessionId);
  });
  try {
    await mcpServer.connect(transport);
  } catch (err) {
    state.errorCount++;
    process.stderr.write(
      `SSE connect failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
});

app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = (req.query.sessionId as string | undefined) ?? "";
  const transport = sseTransports.get(sessionId);
  if (!transport) {
    res.status(400).json({ error: "no active session for sessionId" });
    return;
  }
  await transport.handlePostMessage(req, res, req.body);
});

// Route for clients that speak the old 'single-endpoint' style (POST /mcp/sse)
app.post("/mcp/sse", async (req: Request, res: Response) => {
  const sessionId = (req.query.sessionId as string | undefined) ?? "";
  const transport = sseTransports.get(sessionId);
  if (!transport) {
    res.status(400).json({ error: "no active session for sessionId" });
    return;
  }
  await transport.handlePostMessage(req, res, req.body);
});

// ---- Error sink ----
app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  state.errorCount++;
  process.stderr.write(`connector error: ${err.message}\n`);
  if (!res.headersSent) {
    res.status(500).json({ error: "internal" });
  }
});

// ----------------------------------------------------------------
// Startup
// ----------------------------------------------------------------

function startupHint(): void {
  const mode = AUTH_TOKEN ? "authenticated" : "localhost-only";
  process.stdout.write(
    `coolify-11d connector listening on http://${BIND_HOST}:${PORT} (${mode})\n`,
  );
  process.stdout.write(`  setup UI:  http://${BIND_HOST}:${PORT}/\n`);
  process.stdout.write(`  MCP SSE:   http://${BIND_HOST}:${PORT}/mcp/sse\n`);

  if (!AUTH_TOKEN) {
    process.stderr.write("WARNING: CONNECTOR_AUTH_TOKEN unset — bound to 127.0.0.1 only.\n");
  }

  // Auto-hydrate runtime from env at startup so the UI shows saved state
  try {
    const cfg = resolveConfig();
    runtime = { baseUrl: cfg.baseUrl, token: cfg.token };
    process.stdout.write(`  Coolify:   ${cfg.baseUrl}\n`);
  } catch {
    process.stdout.write("  Coolify:   not configured — set via setup UI\n");
  }
}

const server = createServer(app);
server.listen(PORT, BIND_HOST, startupHint);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    process.stdout.write(`\nShutting down (${sig})...\n`);
    server.close(() => process.exit(0));
  });
}
