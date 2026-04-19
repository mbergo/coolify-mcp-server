# Integrations

Per-client configuration snippets for plugging `coolify-11d` into an AI assistant.

Two shapes:

- **Local stdio** — the client spawns `coolify-11d-mcp` as a child process (installed via `npm i -g coolify-11d` or run with `npx -y coolify-11d-mcp`). Creds come from env vars injected by the client.
- **Remote SSE connector** — a containerized connector speaks MCP over SSE (`http://<host>:3111/mcp/sse`). Ideal for team installs, Claude.ai remote MCP, or MetaMCP orchestration. Auth with `Authorization: Bearer <CONNECTOR_AUTH_TOKEN>`.

| Client | File |
|---|---|
| Claude Desktop | [`claude-desktop.json`](./claude-desktop.json) |
| Claude Code | [`claude-code.json`](./claude-code.json) |
| Cursor | [`cursor.json`](./cursor.json) |
| Windsurf | [`windsurf.json`](./windsurf.json) |
| VS Code (Continue / Cline / …) | [`vscode.json`](./vscode.json) |
| MetaMCP | [`metamcp.json`](./metamcp.json) |

Every config assumes you've already provisioned:

- `COOLIFY_BASE_URL` — e.g. `https://xyz.v3ct0r.one`
- `COOLIFY_TOKEN` — Laravel Sanctum token with `*` scope (see [PRD §3.1](../../PRD-01-coolify-11d.md))

For remote connector configs, also set `CONNECTOR_AUTH_TOKEN` when running the Docker image.
