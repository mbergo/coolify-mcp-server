# coolify-11d

> Unified **CLI**, **MCP server**, and **Claude.ai SSE connector** for self-hosted [Coolify](https://coolify.io).

Three surfaces, one codebase:

1. **CLI** — `coolify-11d apps list`, `coolify-11d deploy`, …
2. **MCP Server** — stdio transport for Claude Code, Claude Desktop, Cursor, Windsurf, VS Code
3. **SSE Connector** — containerized remote MCP server with a setup UI (MetaMCP + Claude.ai compatible)

Ships with an opinionated `-11d` naming convention that replaces Coolify's auto-generated `supabase-<SHA>` names with deterministic, human-readable ones.

See [`PRD-01-coolify-11d.md`](./PRD-01-coolify-11d.md) for the full product spec.

---

## Status

🚧 **Scaffold phase** — Phase 1 in progress. See [Development Phases](#development-phases).

---

## Quickstart

### CLI

```bash
npm install -g coolify-11d
coolify-11d init              # interactive setup
coolify-11d apps list
coolify-11d db create postgres --name pg-main-11d --server <uuid> --project <uuid>
```

### MCP server (Claude Desktop)

```json
{
  "mcpServers": {
    "coolify-11d": {
      "command": "npx",
      "args": ["-y", "coolify-11d-mcp"],
      "env": {
        "COOLIFY_BASE_URL": "https://xyz.v3ct0r.one",
        "COOLIFY_TOKEN": "<your-token>"
      }
    }
  }
}
```

### Containerized connector

```bash
docker run -d -p 3111:3111 \
  -e COOLIFY_BASE_URL=https://xyz.v3ct0r.one \
  -e COOLIFY_TOKEN=<token> \
  -e CONNECTOR_AUTH_TOKEN=<shared-secret> \
  ghcr.io/v3ct0r/coolify-11d:latest

# Open http://localhost:3111 for the setup UI
# MCP SSE endpoint:  http://localhost:3111/mcp/sse
```

---

## Development

All common tasks are Make targets — run `make help` for the full list.

```bash
make install          # install deps
make dev              # run connector with hot reload
make dev-cli ARGS="apps list"
make dev-mcp          # run MCP stdio server
make test             # unit tests
make test-integration # hits live Coolify (needs COOLIFY_TOKEN)
make test-e2e         # CLI + MCP + connector end-to-end
make check            # biome + tsc
make build            # compile to dist/
make docker-build     # build container image
make compose-up       # docker compose up -d
```

### Deploying to Render

```bash
cp .env.example .env              # fill RENDER_API_KEY
make render-install               # install Render CLI
make render-validate              # validate render.yaml
make render-create                # one-time: create service from this repo
# After creation, put the returned service ID in .env as RENDER_SERVICE_ID
make render-deploy                # trigger + wait for deploy
make render-logs                  # tail logs
```

---

## Architecture

```
┌───────────────────────────────────────────────────┐
│                   coolify-11d                     │
│                                                   │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  CLI    │  │ MCP      │  │ SSE Connector    │  │
│  │         │  │ (stdio)  │  │ + setup UI       │  │
│  └────┬────┘  └────┬─────┘  └────────┬─────────┘  │
│       └────────────┼─────────────────┘            │
│             ┌──────▼───────┐                      │
│             │ Core Engine  │                      │
│             │ api-client   │                      │
│             │ naming (-11d)│                      │
│             │ optimizer    │                      │
│             │ auth         │                      │
│             └──────┬───────┘                      │
└────────────────────┼──────────────────────────────┘
                     ▼
            Coolify API /api/v1/*
```

---

## Naming convention

Coolify auto-generates resource names like `supabase-a3f7b2c1d4e5`. coolify-11d intercepts every create and renames to:

```
<name>-11d            # single instance
<name>-11d-01         # multi-instance (01 .. 40)
```

Collision policy is configurable (`error` | `increment` | `prompt`, default `increment`).

---

## Development Phases

- **Phase 1** — Core engine + CLI (P0 commands)
- **Phase 2** — MCP server (stdio) with all tools + composites
- **Phase 3** — Containerized SSE connector + setup UI
- **Phase 4** — Polish, docs, distribution (npm + GHCR + Render)

---

## License

MIT — see [LICENSE](./LICENSE).
