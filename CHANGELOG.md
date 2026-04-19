# Changelog

All notable changes to **coolify-11d** are documented here.
Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Added

- **Phase 4 polish**
  - `scripts/gen-docs.mjs` — auto-generates `docs/tools.md`, `docs/resources.md`, `docs/cli.md` by probing the built MCP server + CLI.
  - `make docs` / `npm run gen:docs` target.
  - `docs/integrations/` snippets for Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, MetaMCP.
  - Circuit breaker in `CoolifyApiClient` — trips after N consecutive 5xx / network failures, half-opens after a configurable cooldown. Options: `breakerThreshold` (default 5), `breakerCooldownMs` (default 30 s). New `client.circuitOpen` getter.
  - Homebrew formula stub at `Formula/coolify-11d.rb` (stretch; activated once a GitHub release tarball exists).
  - `CHANGELOG.md`.

## [0.1.0] — Phase 1–3 (foundation)

### Core engine

- `CoolifyApiClient` with 13 typed resource namespaces covering every PRD §6 endpoint.
- Retry + exponential backoff with jitter on 5xx / 408 / 429.
- Auto-recovery: one-shot `GET /api/v1/enable` on "API disabled" responses.
- `probeTokenScope` — three-probe classification (read-only / read:sensitive / *).
- `conf`-backed encrypted config store with env overlay.
- Naming engine: `-11d` suffix, sanitizer, reserved names, collision policy (`error` / `increment` / `prompt`).
- `createWithNaming` orchestrator so every create surface lands as `<base>-11d[-NN]`.
- Response optimizer: compact / standard / full, < 2 KB compact budget, recursive redaction gated on scope.
- Zero-dep fuzzy smart search across 5 resource kinds.

### CLI

- `commander` + `@inquirer/prompts` + `cli-table3`.
- Global flags: `--format table|json|minimal|yaml`, `--verbosity compact|standard|full`, `--verbose`.
- Subcommands: `init`, `config {set|get|unset|list|path|clear}`, `system`, `apps`, `db`, `svc`, `deploy`, `server`, `project`, `search`.
- Interactive destructive prompts with `-y|--yes` bypass.
- Full create/read/update/delete coverage for apps (6 flavours), databases (8 engines), services, projects, servers.

### MCP server

- Stdio transport via `@modelcontextprotocol/sdk`.
- **116 tools** split across 14 categories: system, applications, databases, services, deployments, servers, projects, teams, keys, resources, github, cloud, hetzner, search, composites.
- **6 static resources** + **5 UUID-templated resources** under `coolify://`.
- Composite / power tools: `status_overview`, `rename_resource`, `restart_project_apps`, `bulk_env_update`, `emergency_stop_all`, `redeploy_project`, `preview_elevend_name`.
- All destructive tools require `confirm: true`.

### SSE connector

- Containerised remote MCP server on port 3111.
- Express routes: `/` (setup UI), `/api/status`, `/api/config`, `/api/test`, `/api/tools`, `/mcp/sse` + `/messages`.
- Setup UI: vanilla HTML/CSS/JS, dark/light themed, test-and-save flow, tool catalogue, live status.
- Bearer auth middleware; unset `CONNECTOR_AUTH_TOKEN` → localhost-only bind.
- Multi-arch Alpine Docker image (`ghcr.io/v3ct0r/coolify-11d`).
- Render Blueprint (`render.yaml`) with automatic preview environments on pull requests.

### CI / distribution

- GitHub Actions: CI (lint + typecheck + build + CLI smoke + connector smoke), Docker (multi-arch GHCR on `v*.*.*` tags), npm publish with provenance, Render deploy.
- Makefile with 45+ targets (`dev`, `build`, `test*`, `docker-*`, `render-*`, `release-*`, `docs`).
