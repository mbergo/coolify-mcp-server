/**
 * coolify-11d SSE connector.
 *
 * Scaffold — serves a placeholder UI, /api/status, and a stub SSE route.
 * Full MCP SSE transport + setup UI wiring land in PR #9.
 */

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const PORT = Number(process.env.PORT ?? 3111);
const AUTH_TOKEN = process.env.CONNECTOR_AUTH_TOKEN ?? "";
const BIND_HOST = AUTH_TOKEN ? "0.0.0.0" : "127.0.0.1";

interface ConnectorStatus {
  status: "ok";
  version: string;
  authRequired: boolean;
  coolifyBaseUrl: string;
  lastRequestAt: string | null;
  errorCount: number;
}

const state = {
  lastRequestAt: null as string | null,
  errorCount: 0,
};

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadUiHtml(): string {
  // In dev, src/connector/ui/index.html.
  // In dist, the build copies it next to server.js; fall back to placeholder.
  const candidates = [
    join(__dirname, "ui/index.html"),
    join(__dirname, "../../src/connector/ui/index.html"),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      // try next
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>coolify-11d</title>
    </head><body><h1>coolify-11d connector</h1>
    <p>UI not yet bundled. Full setup UI lands in PR #9.</p>
    <ul>
      <li><a href="/api/status">/api/status</a></li>
      <li>MCP SSE endpoint: <code>/mcp/sse</code> (stub)</li>
    </ul></body></html>`;
}

const app = express();
app.use(express.json());

// Touch activity clock on every request.
app.use((req, res, next) => {
  state.lastRequestAt = new Date().toISOString();
  // Auth required on write + /mcp/* routes; /api/status and / stay public.
  if (AUTH_TOKEN) {
    const publicPath = req.path === "/" || req.path === "/api/status" || req.method === "GET";
    const needsAuth = req.path.startsWith("/mcp/") || !publicPath;
    if (needsAuth) {
      const header = req.headers.authorization ?? "";
      if (header !== `Bearer ${AUTH_TOKEN}`) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
    }
  }
  next();
});

app.get("/", (_req, res) => {
  res.type("html").send(loadUiHtml());
});

app.get("/api/status", (_req, res) => {
  const payload: ConnectorStatus = {
    status: "ok",
    version: "0.1.0",
    authRequired: Boolean(AUTH_TOKEN),
    coolifyBaseUrl: process.env.COOLIFY_BASE_URL ?? "",
    lastRequestAt: state.lastRequestAt,
    errorCount: state.errorCount,
  };
  res.json(payload);
});

// Placeholder SSE endpoint — wired to MCP SSE transport in PR #9.
app.get("/mcp/sse", (_req, res) => {
  res.status(501).json({ error: "not implemented — scaffolded in PR #9" });
});

const server = createServer(app);
server.listen(PORT, BIND_HOST, () => {
  const mode = AUTH_TOKEN ? "authenticated" : "localhost-only";
  process.stdout.write(
    `coolify-11d connector listening on http://${BIND_HOST}:${PORT} (${mode})\n`,
  );
  if (!AUTH_TOKEN) {
    process.stderr.write("WARNING: CONNECTOR_AUTH_TOKEN unset — bound to 127.0.0.1 only.\n");
  }
});

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    process.stdout.write(`\nShutting down (${sig})...\n`);
    server.close(() => process.exit(0));
  });
}
