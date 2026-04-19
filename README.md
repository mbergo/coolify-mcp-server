# coolify-11d

> Unified **CLI**, **MCP server**, and **Claude.ai SSE connector** for self-hosted [Coolify](https://coolify.io).

Three surfaces, one codebase:

1. **CLI** — authoring tool for Coolify resources (`coolify-11d apps list`, `coolify-11d db create postgres`, …)
2. **MCP Server** — stdio transport for Claude Code, Claude Desktop, Cursor, Windsurf, VS Code
3. **SSE Connector** — containerized remote MCP server with a setup UI (MetaMCP + Claude.ai compatible)

Ships with an opinionated `-11d` naming convention that replaces Coolify's auto-generated `supabase-<SHA>` names with deterministic, human-readable ones — and a response optimizer that keeps AI context windows under budget.

See [`PRD-01-coolify-11d.md`](./PRD-01-coolify-11d.md) for the full product spec.

---

## Status

🧪 **Active development.** Core engine, CLI read/write, naming, optimizer, and MCP read tools are shipped and tested (123 unit tests, 100% green). Full MCP tool registry, composite tools, and the containerized SSE connector are landing next.

| Area | Ready |
|---|---|
| Core API client (retry/backoff, auto-enable, 13 resource namespaces) | ✅ |
| `-11d` naming engine + collision policy (`error` / `increment` / `prompt`) | ✅ |
| Response optimizer (compact / standard / full + redaction + <2 KB budget) | ✅ |
| Smart lookup (UUID · name · FQDN · IP · fuzzy) | ✅ |
| Token scope probe + persistent encrypted config store | ✅ |
| CLI read + lifecycle + write (apps/db/svc/project/server), `init` wizard, `config` subcommand | ✅ |
| MCP server (stdio) — system + read + search tools | ✅ (16 tools) |
| MCP server — full tool registry + composites | 🚧 |
| SSE connector + setup UI + Docker + Render blueprint | 🚧 (scaffolded) |

---

## Quickstart

### CLI

```bash
# one-time setup
npm install -g coolify-11d
coolify-11d init                       # interactive wizard — asks base URL, token, probes scope

# browse
coolify-11d apps list                  # compact table by default
coolify-11d apps list --format json    # or json / minimal / yaml
coolify-11d apps get <uuid> --verbose  # full API response

# authoring
coolify-11d db create postgres \
    --name pg-main --server <uuid> --project <uuid>
# → pg-main-11d (rename auto-applied after create)

coolify-11d apps create-dockerfile \
    --name my-api --server <uuid> --project <uuid> \
    --dockerfile @./Dockerfile

# lifecycle
coolify-11d apps start <uuid>
coolify-11d apps stop  <uuid>           # confirmation prompt (use -y to skip)
coolify-11d apps delete <uuid> -y

# find anything by name / UUID / domain / IP
coolify-11d search api.example.com
coolify-11d search cache --kind database

# manage config
coolify-11d config list
coolify-11d config set output_format json
coolify-11d config path                 # print config file path
```

Run `coolify-11d --help` or any subcommand with `--help` for the full option surface.

### MCP server (Claude Desktop / Claude Code / Cursor / Windsurf)

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

Tools currently registered: `system_health`, `system_version`, `list_applications`, `get_application`, `start/stop/restart_application`, `list/get_databases`, `list/get_services`, `list/get_deployments`, `list/get_servers`, `list/get_projects`, `search_resources`. Every read tool accepts a `verbosity` input (`compact` · `standard` · `full`, default `compact`).

### Containerized SSE connector

```bash
docker run -d -p 3111:3111 \
    -e COOLIFY_BASE_URL=https://xyz.v3ct0r.one \
    -e COOLIFY_TOKEN=<token> \
    -e CONNECTOR_AUTH_TOKEN=<shared-secret> \
    ghcr.io/v3ct0r/coolify-11d:latest

# Browse the setup UI:   http://localhost:3111
# MCP SSE endpoint:      http://localhost:3111/mcp/sse
```

> Scaffolded — full setup UI + SSE wiring arrive in the connector phase.

---

## Naming convention

Coolify auto-generates resource names like `supabase-a3f7b2c1d4e5`. coolify-11d intercepts every create call and renames to a deterministic pattern:

```
<name>-11d            # single instance
<name>-11d-01         # multi-instance (01 .. 40)
```

Collision policy is configurable — set with `coolify-11d config set naming_collision <policy>`:

- `increment` (default) — auto-walk `-01` … `-40` until a free slot is found
- `error` — throw and let the caller handle it
- `prompt` — ask interactively (CLI wires inquirer, MCP rejects with a structured error)

Reserved names (`coolify`, `docker`, `localhost`, `admin`, `root`, `system`) are refused. Names are sanitised to Kubernetes-style safe charset before the suffix is applied.

---

## Response optimization

Every read helper returns one of three shapes:

| Verbosity | Size budget | Use |
|---|---|---|
| `compact` | < 2 KB per entity (enforced) | MCP default, listings, search |
| `standard` | ~30 fields, heavy blobs stripped | CLI default |
| `full` | raw API response | opt-in via `--verbose` / `verbosity: "full"` |

Sensitive fields (`password`, `secret`, `token`, `api_key`, `private_key`, `ssh_key`, `credential`) are redacted in every output mode unless **both** `verbosity: "full"` **and** the token scope is `*` / `read:sensitive` / `view:sensitive`. Env var keys stay visible; values are redacted.

---

## Smart lookup

```bash
coolify-11d search <query>
```

Match order: exact UUID → exact name → FQDN / IP → fuzzy name (zero-dep substring + Levenshtein). Filter with `--kind application database service server project`, limit with `--limit`, tune fuzzy matching with `--threshold 0.5`.

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
│             ┌──────▼──────────┐                   │
│             │  Core engine    │                   │
│             │  api-client     │   retry, auto-enable,
│             │  auth           │   scope probe
│             │  naming (-11d)  │   collision policy
│             │  optimizer      │   compact/std/full + redact
│             │  create-with-   │   post-create rename hook
│             │    naming       │
│             │  search         │   fuzzy lookup
│             │  compact        │   optimizer-backed helpers
│             │  config         │   env + encrypted file store
│             └──────┬──────────┘                   │
└────────────────────┼──────────────────────────────┘
                     ▼
            Coolify API /api/v1/*
```

---

## Configuration

Precedence: **env vars > `~/.config/coolify-11d/config.json` > defaults**.

| Key | Env | Default |
|---|---|---|
| `base_url` | `COOLIFY_BASE_URL` | — (required) |
| `token` | `COOLIFY_TOKEN` | — (required) |
| `naming_suffix` | `COOLIFY_NAMING_SUFFIX` | `11d` |
| `naming_collision` | `COOLIFY_NAMING_COLLISION` | `increment` |
| `output_format` | — | `table` |
| `verbosity` | — | `standard` (CLI) / `compact` (MCP) |
| `default_server_uuid` / `default_project_uuid` | — | — |

Token is encrypted at rest using a key derived from `COOLIFY_11D_ENC_KEY` (override with your own value) or a stable fallback.

---

## Development

All common tasks are Make targets — run `make help` for the full list.

```bash
make install              # install deps
make dev                  # run connector with hot reload
make dev-cli ARGS="apps list"
make dev-mcp              # run MCP stdio server

make test                 # unit tests (123 passing)
make test-integration     # live Coolify (needs COOLIFY_TOKEN)
make test-e2e             # CLI + MCP + connector

make check                # biome + tsc --noEmit
make build                # tsup → dist/
make coverage             # v8 coverage

make docker-build
make compose-up
```

### Deploying to Render

```bash
cp .env.example .env               # fill RENDER_API_KEY
make render-install                # install Render CLI
make render-validate               # render blueprints validate render.yaml
make render-create                 # one-time service creation
# Put the returned service ID in .env as RENDER_SERVICE_ID
make render-deploy                 # trigger + wait
make render-logs                   # tail
```

---

## Project structure

```
src/
├── core/                      # transport-agnostic engine
│   ├── api-client.ts              # 13 typed namespaces, retry, auto-enable
│   ├── auth.ts                    # probeTokenScope, ensureApiEnabled
│   ├── compact.ts                 # list*/get* helpers (optimizer-backed)
│   ├── config.ts                  # env overlay + encrypted conf store
│   ├── create-with-naming.ts      # high-level create wrappers
│   ├── naming.ts                  # -11d rules + collision resolver
│   ├── optimizer.ts               # compact/std/full + redaction
│   ├── search.ts                  # UUID/name/FQDN/IP + fuzzy
│   ├── types.ts                   # entity + input shapes
│   └── index.ts
├── cli/
│   ├── index.ts                   # commander entry
│   ├── prompt.ts                  # inquirer wrappers
│   ├── commands/                  # init, config, apps/db/svc/project/server writes
│   └── formatters/output.ts       # table (cli-table3) + json + minimal + yaml
├── mcp/server.ts                  # stdio server + Zod-validated tools
└── connector/                     # Express SSE + setup UI (scaffolded)
tests/
└── unit/                          # 10 files, 123 tests
```

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript 5 · Node 22 LTS · ESM | Native fetch, MCP SDK target |
| MCP SDK | `@modelcontextprotocol/sdk ^1.29` | Stdio + SSE transport |
| CLI | `commander` + `@inquirer/prompts` + `cli-table3` | Proven subcommand framework |
| Validation | `zod` | Runtime MCP tool schemas |
| Config | `conf` | XDG-compliant encrypted store |
| HTTP | native `fetch` | Zero dep |
| Build | `tsup` | Fast ESM bundle |
| Test | `vitest` + `msw` | TS-native, fast |
| Lint | `biome` | All-in-one |
| Container | Alpine Docker multi-stage | < 50 MB target |

---

## License

MIT — see [LICENSE](./LICENSE).
