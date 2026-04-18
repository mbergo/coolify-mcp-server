# PRD-01: coolify-11d

## CLI, MCP Server & Claude.ai Connector for Coolify

**Document ID:** PRD-01
**Project Codename:** coolify-11d
**Author:** Marcus (v3ct0r)
**Status:** Draft
**Created:** 2026-04-14
**Target Runtime:** Node.js / TypeScript (primary), Docker container (distribution)

---

## 1. Executive Summary

**coolify-11d** is a unified CLI tool, MCP (Model Context Protocol) server, and Claude.ai connector for managing a self-hosted Coolify instance. It provides three consumption surfaces from a single codebase:

1. **CLI** — Direct terminal commands for Coolify operations (`coolify-11d apps list`, `coolify-11d deploy`, etc.)
2. **MCP Server** — Stdio/SSE transport for AI assistants (Claude Code, Claude Desktop, VS Code, Cursor, Windsurf)
3. **Claude.ai Connector** — SSE-based remote MCP server, containerized with a setup UI, compatible with MetaMCP and other IDE integrations

The naming convention replaces Coolify's default `supabase-<SHA>` resource naming with a deterministic `<name>-11d` scheme (multi-instance: `<name>-11d-01` through `<name>-11d-40`).

---

## 2. Problem Statement

### 2.1 Current Landscape

There are ~7 existing Coolify MCP servers on npm/GitHub. All share common deficiencies:

- **No CLI mode.** Every one is MCP-only. No standalone terminal usage without an AI client.
- **No containerized distribution.** All require `npx` or manual `node` execution. No Docker image with a setup UI.
- **No Claude.ai connector.** None expose SSE transport for direct Claude.ai integration.
- **No resource naming governance.** None address the `supabase-<SHA>` naming problem.
- **Verbose API responses.** Most pass raw Coolify API payloads (91+ fields per application, 200KB+ for bulk listings). Only `@masonator/coolify-mcp` addresses context window optimization, but without CLI support.
- **No MetaMCP compatibility.** None are designed for multi-server MCP orchestration.

### 2.2 Competitive References (Read-Only — Do Not Fork)

| Package | Author | Tools | CLI | Container | Connector | Token-Optimized |
|---|---|---|---|---|---|---|
| `@masonator/coolify-mcp` | StuMason | 38 | No | No | No | Yes |
| `coolify-mcp-server` | wrediam | ~20 | No | No | No | No |
| `coolify-mcp-enhanced` | dazeb | ~30 | No | No | No | No |
| `@felixallistar/coolify-mcp` | FelixAllistar | Full API | Partial | No | No | No |
| `@fndchagas/coolify-mcp` | frndchagas | ~15 | No | No | No | No |
| `coolify-mcp` | Ruashots | ~25 | No | No | No | No |
| **coolify-11d (this)** | **v3ct0r** | **Full API** | **Yes** | **Yes** | **Yes** | **Yes** |

---

## 3. Target Instance

| Property | Value |
|---|---|
| Base URL | `https://xyz.v3ct0r.one` |
| API Base | `https://xyz.v3ct0r.one/api/v1` |
| Health Endpoint | `https://xyz.v3ct0r.one/api/health` → `OK` |
| Auth Header | `Authorization: Bearer <TOKEN>` |
| Token Format | Laravel Sanctum (`<id>\|<hash>`) |
| API Enable Endpoint | `GET /api/v1/enable` (must be called before other endpoints if API is disabled) |
| Tested Status | Instance alive, API requires `*` permission scope token for full access |

### 3.1 API Token Permissions

Coolify supports four permission scopes:

- `read-only` (default) — Read-only, no sensitive data
- `read:sensitive` — Read-only with sensitive data (passwords, keys)
- `view:sensitive` — Alias behavior for sensitive field visibility
- `*` — Full CRUD access to all resources and sensitive data

**Requirement:** The MCP server MUST validate token permissions on startup and warn if scope is insufficient for requested operations.

---

## 4. Naming Convention

### 4.1 The Problem

Coolify auto-generates resource names as `supabase-<SHA-HASH>` (e.g., `supabase-a3f7b2c1d4e5`). These are unreadable, unidentifiable, and collision-prone in multi-project environments.

### 4.2 The Solution

All resources created through coolify-11d follow this naming scheme:

```
<descriptive-name>-11d          # Single instance
<descriptive-name>-11d-01       # Multi-instance (01 through 40)
```

Examples:

```
api-gateway-11d                 # Single API gateway
redis-cache-11d-01              # First Redis cache instance
redis-cache-11d-02              # Second Redis cache instance
postgres-main-11d               # Primary PostgreSQL
```

### 4.3 Rename-on-Create Hook

When any `create` operation is invoked, the tool MUST:

1. Intercept the Coolify-generated name
2. Strip the `supabase-<SHA>` pattern
3. Apply the `-11d` suffix (or `-11d-NN` for multi-instance)
4. Issue a `PATCH` to rename the resource via the API

---

## 5. Architecture

### 5.1 High-Level Design

```
┌───────────────────────────────────────────────────┐
│                   coolify-11d                     │
│                                                   │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  CLI    │  │ MCP      │  │ SSE Connector    │ │
│  │ (yargs/ │  │ Server   │  │ (Express +       │ │
│  │  cmdr)  │  │ (stdio)  │  │  MCP SSE)        │ │
│  └────┬────┘  └────┬─────┘  └────────┬─────────┘ │
│       │            │                 │            │
│       └────────────┼─────────────────┘            │
│                    │                              │
│            ┌───────▼────────┐                     │
│            │  Core Engine   │                     │
│            │                │                     │
│            │ • API Client   │                     │
│            │ • Naming Gov.  │                     │
│            │ • Response Opt.│                     │
│            │ • Auth Mgr     │                     │
│            └───────┬────────┘                     │
│                    │                              │
└────────────────────┼──────────────────────────────┘
                     │
            ┌────────▼────────┐
            │  Coolify API    │
            │  /api/v1/*      │
            └─────────────────┘
```

### 5.2 Module Breakdown

**`core/`** — Shared engine (zero dependency on transport layer)

- `api-client.ts` — HTTP client wrapping all Coolify API endpoints. Axios or `fetch`-based. Handles auth, retries, error normalization.
- `naming.ts` — Naming convention enforcement. Rename-on-create logic.
- `optimizer.ts` — Response trimming. Maps verbose 91-field application objects to compact summaries (~15 fields). Configurable verbosity levels.
- `auth.ts` — Token validation, permission scope detection, API enable/disable management.
- `types.ts` — Full TypeScript interfaces for all Coolify API entities.

**`cli/`** — CLI surface

- Built on `commander` or `yargs`
- Subcommand structure: `coolify-11d <resource> <action> [options]`
- Output formatters: table, JSON, minimal
- Interactive prompts for destructive operations
- Config file: `~/.config/coolify-11d/config.json`

**`mcp/`** — MCP Server surface

- `server.ts` — MCP server using `@modelcontextprotocol/sdk`
- `tools.ts` — Tool definitions mapping to Core Engine functions
- `resources.ts` — MCP resource endpoints for listing/inspecting Coolify resources
- Transport: stdio (default), SSE (for connector mode)

**`connector/`** — Containerized SSE server with setup UI

- `server.ts` — Express/Fastify HTTP server
- `ui/` — Simple React setup page (single HTML or lightweight SPA)
- `Dockerfile` — Multi-stage build, Alpine-based
- `docker-compose.yml` — Ready-to-deploy configuration

---

## 6. Coolify API Coverage

### 6.1 Complete Endpoint Map

The API surface (as documented at `https://coolify.io/docs/api-reference/`) breaks down into 10 resource categories. Every endpoint MUST be implemented as both a CLI subcommand and an MCP tool.

#### 6.1.1 System / Default

| Method | Endpoint | CLI Command | MCP Tool | Priority |
|---|---|---|---|---|
| GET | `/version` | `coolify-11d system version` | `system_version` | P0 |
| GET | `/enable` | `coolify-11d system enable-api` | `system_enable_api` | P0 |
| GET | `/disable` | `coolify-11d system disable-api` | `system_disable_api` | P1 |
| GET | `/healthcheck` | `coolify-11d system health` | `system_health` | P0 |

#### 6.1.2 Applications

| Method | Endpoint | CLI Command | MCP Tool | Priority |
|---|---|---|---|---|
| GET | `/applications` | `coolify-11d apps list` | `list_applications` | P0 |
| POST | `/applications/public` | `coolify-11d apps create-public` | `create_public_app` | P0 |
| POST | `/applications/private-github-app` | `coolify-11d apps create-gh` | `create_gh_app` | P1 |
| POST | `/applications/private-deploy-key` | `coolify-11d apps create-deploy-key` | `create_deploy_key_app` | P1 |
| POST | `/applications/dockerfile` | `coolify-11d apps create-dockerfile` | `create_dockerfile_app` | P0 |
| POST | `/applications/dockerimage` | `coolify-11d apps create-image` | `create_dockerimage_app` | P0 |
| POST | `/applications/dockercompose` | `coolify-11d apps create-compose` | `create_compose_app` | P0 |
| GET | `/applications/{uuid}` | `coolify-11d apps get <uuid>` | `get_application` | P0 |
| DELETE | `/applications/{uuid}` | `coolify-11d apps delete <uuid>` | `delete_application` | P1 |
| PATCH | `/applications/{uuid}` | `coolify-11d apps update <uuid>` | `update_application` | P0 |
| GET | `/applications/{uuid}/logs` | `coolify-11d apps logs <uuid>` | `get_app_logs` | P0 |
| GET | `/applications/{uuid}/envs` | `coolify-11d apps envs list <uuid>` | `list_app_envs` | P0 |
| POST | `/applications/{uuid}/envs` | `coolify-11d apps envs create <uuid>` | `create_app_env` | P0 |
| PATCH | `/applications/{uuid}/envs` | `coolify-11d apps envs update <uuid>` | `update_app_env` | P1 |
| PATCH | `/applications/{uuid}/envs/bulk` | `coolify-11d apps envs bulk <uuid>` | `bulk_update_app_envs` | P1 |
| DELETE | `/applications/{uuid}/envs/{env_uuid}` | `coolify-11d apps envs delete` | `delete_app_env` | P1 |
| GET | `/applications/{uuid}/start` | `coolify-11d apps start <uuid>` | `start_application` | P0 |
| GET | `/applications/{uuid}/stop` | `coolify-11d apps stop <uuid>` | `stop_application` | P0 |
| GET | `/applications/{uuid}/restart` | `coolify-11d apps restart <uuid>` | `restart_application` | P0 |

#### 6.1.3 Databases

| Method | Endpoint | CLI Command | MCP Tool | Priority |
|---|---|---|---|---|
| GET | `/databases` | `coolify-11d db list` | `list_databases` | P0 |
| GET | `/databases/{uuid}` | `coolify-11d db get <uuid>` | `get_database` | P0 |
| DELETE | `/databases/{uuid}` | `coolify-11d db delete <uuid>` | `delete_database` | P1 |
| PATCH | `/databases/{uuid}` | `coolify-11d db update <uuid>` | `update_database` | P1 |
| POST | `/databases/postgresql` | `coolify-11d db create postgres` | `create_postgres` | P0 |
| POST | `/databases/mysql` | `coolify-11d db create mysql` | `create_mysql` | P1 |
| POST | `/databases/mariadb` | `coolify-11d db create mariadb` | `create_mariadb` | P2 |
| POST | `/databases/mongodb` | `coolify-11d db create mongodb` | `create_mongodb` | P1 |
| POST | `/databases/redis` | `coolify-11d db create redis` | `create_redis` | P0 |
| POST | `/databases/clickhouse` | `coolify-11d db create clickhouse` | `create_clickhouse` | P2 |
| POST | `/databases/dragonfly` | `coolify-11d db create dragonfly` | `create_dragonfly` | P2 |
| POST | `/databases/keydb` | `coolify-11d db create keydb` | `create_keydb` | P2 |
| GET | `/databases/{uuid}/backups` | `coolify-11d db backups list <uuid>` | `list_db_backups` | P1 |
| POST | `/databases/{uuid}/backups` | `coolify-11d db backups create <uuid>` | `create_db_backup` | P1 |
| PATCH | `/databases/{uuid}/backups` | `coolify-11d db backups update <uuid>` | `update_db_backup` | P2 |
| DELETE | `/databases/{uuid}/backups/{backup_uuid}` | `coolify-11d db backups delete` | `delete_db_backup` | P2 |
| GET | `/databases/{uuid}/backups/executions` | `coolify-11d db backups executions` | `list_backup_execs` | P2 |
| DELETE | `/databases/{uuid}/backups/executions/{exec_uuid}` | `coolify-11d db backups exec-delete` | `delete_backup_exec` | P2 |
| GET | `/databases/{uuid}/start` | `coolify-11d db start <uuid>` | `start_database` | P0 |
| GET | `/databases/{uuid}/stop` | `coolify-11d db stop <uuid>` | `stop_database` | P0 |
| GET | `/databases/{uuid}/restart` | `coolify-11d db restart <uuid>` | `restart_database` | P0 |

#### 6.1.4 Services

| Method | Endpoint | CLI Command | MCP Tool | Priority |
|---|---|---|---|---|
| GET | `/services` | `coolify-11d svc list` | `list_services` | P0 |
| POST | `/services` | `coolify-11d svc create` | `create_service` | P0 |
| GET | `/services/{uuid}` | `coolify-11d svc get <uuid>` | `get_service` | P0 |
| DELETE | `/services/{uuid}` | `coolify-11d svc delete <uuid>` | `delete_service` | P1 |
| PATCH | `/services/{uuid}` | `coolify-11d svc update <uuid>` | `update_service` | P1 |
| GET | `/services/{uuid}/envs` | `coolify-11d svc envs list <uuid>` | `list_svc_envs` | P1 |
| POST | `/services/{uuid}/envs` | `coolify-11d svc envs create` | `create_svc_env` | P1 |
| PATCH | `/services/{uuid}/envs` | `coolify-11d svc envs update` | `update_svc_env` | P2 |
| PATCH | `/services/{uuid}/envs/bulk` | `coolify-11d svc envs bulk` | `bulk_update_svc_envs` | P2 |
| DELETE | `/services/{uuid}/envs/{env_uuid}` | `coolify-11d svc envs delete` | `delete_svc_env` | P2 |
| GET | `/services/{uuid}/start` | `coolify-11d svc start <uuid>` | `start_service` | P0 |
| GET | `/services/{uuid}/stop` | `coolify-11d svc stop <uuid>` | `stop_service` | P0 |
| GET | `/services/{uuid}/restart` | `coolify-11d svc restart <uuid>` | `restart_service` | P0 |

#### 6.1.5 Deployments

| Method | Endpoint | CLI Command | MCP Tool | Priority |
|---|---|---|---|---|
| GET | `/deployments` | `coolify-11d deploy list` | `list_deployments` | P0 |
| GET | `/deployments/{uuid}` | `coolify-11d deploy get <uuid>` | `get_deployment` | P0 |
| POST | `/deployments/{uuid}/cancel` | `coolify-11d deploy cancel <uuid>` | `cancel_deployment` | P1 |
| GET | `/deploy` | `coolify-11d deploy trigger` | `trigger_deploy` | P0 |
| GET | `/applications/{uuid}/deployments` | `coolify-11d deploy app-history <uuid>` | `list_app_deployments` | P1 |

#### 6.1.6 Servers

| Method | Endpoint | CLI Command | MCP Tool | Priority |
|---|---|---|---|---|
| GET | `/servers` | `coolify-11d server list` | `list_servers` | P0 |
| POST | `/servers` | `coolify-11d server create` | `create_server` | P1 |
| GET | `/servers/{uuid}` | `coolify-11d server get <uuid>` | `get_server` | P0 |
| DELETE | `/servers/{uuid}` | `coolify-11d server delete <uuid>` | `delete_server` | P2 |
| PATCH | `/servers/{uuid}` | `coolify-11d server update <uuid>` | `update_server` | P1 |
| GET | `/servers/{uuid}/resources` | `coolify-11d server resources <uuid>` | `server_resources` | P0 |
| GET | `/servers/{uuid}/domains` | `coolify-11d server domains <uuid>` | `server_domains` | P1 |
| GET | `/servers/{uuid}/validate` | `coolify-11d server validate <uuid>` | `validate_server` | P1 |

#### 6.1.7 Projects

| Method | Endpoint | CLI Command | MCP Tool | Priority |
|---|---|---|---|---|
| GET | `/projects` | `coolify-11d project list` | `list_projects` | P0 |
| POST | `/projects` | `coolify-11d project create` | `create_project` | P0 |
| GET | `/projects/{uuid}` | `coolify-11d project get <uuid>` | `get_project` | P0 |
| DELETE | `/projects/{uuid}` | `coolify-11d project delete <uuid>` | `delete_project` | P1 |
| PATCH | `/projects/{uuid}` | `coolify-11d project update <uuid>` | `update_project` | P1 |
| GET | `/projects/{uuid}/environments` | `coolify-11d project envs list <uuid>` | `list_project_envs` | P1 |
| GET | `/projects/{uuid}/{env_name}` | `coolify-11d project env get` | `get_project_env` | P1 |
| POST | `/projects/{uuid}/environments` | `coolify-11d project envs create` | `create_project_env` | P1 |
| DELETE | `/projects/{uuid}/environments/{env_name}` | `coolify-11d project envs delete` | `delete_project_env` | P2 |

#### 6.1.8 Teams

| Method | Endpoint | CLI Command | MCP Tool | Priority |
|---|---|---|---|---|
| GET | `/teams` | `coolify-11d team list` | `list_teams` | P1 |
| GET | `/teams/{id}` | `coolify-11d team get <id>` | `get_team` | P1 |
| GET | `/teams/{id}/members` | `coolify-11d team members <id>` | `team_members` | P1 |
| GET | `/teams/current` | `coolify-11d team current` | `current_team` | P0 |
| GET | `/teams/current/members` | `coolify-11d team current-members` | `current_team_members` | P1 |

#### 6.1.9 Private Keys

| Method | Endpoint | CLI Command | MCP Tool | Priority |
|---|---|---|---|---|
| GET | `/security/keys` | `coolify-11d keys list` | `list_keys` | P1 |
| POST | `/security/keys` | `coolify-11d keys create` | `create_key` | P1 |
| GET | `/security/keys/{uuid}` | `coolify-11d keys get <uuid>` | `get_key` | P2 |
| PATCH | `/security/keys/{uuid}` | `coolify-11d keys update <uuid>` | `update_key` | P2 |
| DELETE | `/security/keys/{uuid}` | `coolify-11d keys delete <uuid>` | `delete_key` | P2 |

#### 6.1.10 Resources & Cloud Tokens

| Method | Endpoint | CLI Command | MCP Tool | Priority |
|---|---|---|---|---|
| GET | `/resources` | `coolify-11d resources list` | `list_resources` | P0 |
| GET | `/cloud-tokens` | `coolify-11d cloud list` | `list_cloud_tokens` | P2 |
| POST | `/cloud-tokens` | `coolify-11d cloud create` | `create_cloud_token` | P2 |
| GET | `/cloud-tokens/{uuid}` | `coolify-11d cloud get` | `get_cloud_token` | P2 |
| DELETE | `/cloud-tokens/{uuid}` | `coolify-11d cloud delete` | `delete_cloud_token` | P2 |
| PATCH | `/cloud-tokens/{uuid}` | `coolify-11d cloud update` | `update_cloud_token` | P2 |
| POST | `/cloud-tokens/{uuid}/validate` | `coolify-11d cloud validate` | `validate_cloud_token` | P2 |

#### 6.1.11 GitHub Apps

| Method | Endpoint | CLI Command | MCP Tool | Priority |
|---|---|---|---|---|
| GET | `/github-apps` | `coolify-11d github list` | `list_github_apps` | P1 |
| POST | `/github-apps` | `coolify-11d github create` | `create_github_app` | P2 |
| GET | `/github-apps/{uuid}/repos` | `coolify-11d github repos <uuid>` | `list_gh_repos` | P1 |
| GET | `/github-apps/{uuid}/repos/{owner}/{repo}/branches` | `coolify-11d github branches` | `list_gh_branches` | P1 |
| DELETE | `/github-apps/{uuid}` | `coolify-11d github delete <uuid>` | `delete_github_app` | P2 |
| PATCH | `/github-apps/{uuid}` | `coolify-11d github update <uuid>` | `update_github_app` | P2 |

#### 6.1.12 Hetzner Integration

| Method | Endpoint | CLI Command | MCP Tool | Priority |
|---|---|---|---|---|
| GET | `/hetzner/locations` | `coolify-11d hetzner locations` | `hetzner_locations` | P2 |
| GET | `/hetzner/server-types` | `coolify-11d hetzner types` | `hetzner_server_types` | P2 |
| GET | `/hetzner/images` | `coolify-11d hetzner images` | `hetzner_images` | P2 |
| GET | `/hetzner/ssh-keys` | `coolify-11d hetzner keys` | `hetzner_ssh_keys` | P2 |
| POST | `/hetzner/servers` | `coolify-11d hetzner create` | `create_hetzner_server` | P2 |

---

## 7. Response Optimization Strategy

### 7.1 The Problem

Coolify's raw API responses are extremely verbose. A single application object can contain 91+ fields including embedded 3KB server objects and 47KB docker-compose definitions. Listing 20 applications can produce 200KB+ of JSON — enough to exhaust an AI assistant's context window.

### 7.2 The Solution: Three Verbosity Levels

**Compact (default for MCP)** — ~15 fields per entity. Suitable for listing, searching, and quick inspection.

```typescript
interface AppCompact {
  uuid: string;
  name: string;        // with 11d naming
  status: string;
  fqdn: string;
  git_repository?: string;
  git_branch?: string;
  build_pack: string;
  created_at: string;
  updated_at: string;
  server_name: string; // flattened from nested server object
  project_name: string;
  environment: string;
  ports_mappings?: string;
  health_check_status?: string;
  deployment_status?: string;
}
```

**Standard (default for CLI)** — ~30 fields. Adds environment variables (redacted), docker config, resource limits.

**Full (opt-in via `--verbose` or `verbosity: "full"`)** — Raw API response, unmodified.

### 7.3 Smart Lookup

Resources can be located by:
- UUID (native)
- Name (fuzzy match across the 11d naming scheme)
- Domain/FQDN (exact match)
- Server IP (for server resources)

---

## 8. Containerized Connector (Phase 3)

### 8.1 Purpose

A Docker container that runs the MCP server in SSE mode with a lightweight web UI for configuration. This enables:

- Claude.ai integration as a remote MCP connector
- MetaMCP registration
- IDE integration without local Node.js installation
- Multi-user access with token-based auth

### 8.2 Setup UI Requirements

A single-page web interface served on port `3111` (default) that provides:

1. **Connection Form** — Fields for Coolify base URL and API token
2. **Connection Test** — One-click validation (calls `/api/health` then `/api/v1/version`)
3. **Permission Check** — Displays detected token permission scope
4. **SSE Endpoint Display** — Shows the MCP SSE endpoint URL for copy-paste into Claude.ai or IDE config
5. **Tool Catalog** — Browsable list of all available MCP tools with descriptions
6. **Status Dashboard** — Connected/disconnected state, last request timestamp, error count

### 8.3 Docker Configuration

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3111
ENV COOLIFY_BASE_URL=""
ENV COOLIFY_TOKEN=""
ENV PORT=3111
CMD ["node", "dist/connector/server.js"]
```

```yaml
# docker-compose.yml
version: "3.8"
services:
  coolify-11d:
    image: ghcr.io/v3ct0r/coolify-11d:latest
    container_name: coolify-11d
    ports:
      - "3111:3111"
    environment:
      - COOLIFY_BASE_URL=https://xyz.v3ct0r.one
      - COOLIFY_TOKEN=${COOLIFY_TOKEN}
    restart: unless-stopped
```

### 8.4 MetaMCP Registration

The connector exposes a standard MCP SSE endpoint at:

```
http://<host>:3111/mcp/sse
```

MetaMCP config entry:

```json
{
  "name": "coolify-11d",
  "transport": "sse",
  "url": "http://localhost:3111/mcp/sse",
  "description": "Coolify infrastructure management"
}
```

---

## 9. CLI Specification

### 9.1 Installation

```bash
# npm global
npm install -g coolify-11d

# npx (no install)
npx coolify-11d apps list

# Homebrew (future)
brew install coolify-11d
```

### 9.2 Configuration

```bash
# Interactive setup
coolify-11d init

# Manual config
coolify-11d config set base-url https://xyz.v3ct0r.one
coolify-11d config set token <TOKEN>

# Config file location
# ~/.config/coolify-11d/config.json
```

Config file schema:

```json
{
  "base_url": "https://xyz.v3ct0r.one",
  "token": "<encrypted-token>",
  "default_server_uuid": "<uuid>",
  "default_project_uuid": "<uuid>",
  "naming_suffix": "11d",
  "output_format": "table",
  "verbosity": "standard"
}
```

### 9.3 Command Examples

```bash
# System
coolify-11d system health
coolify-11d system version
coolify-11d system enable-api

# Applications
coolify-11d apps list
coolify-11d apps list --format json
coolify-11d apps get <uuid> --verbose
coolify-11d apps create-dockerfile --name my-api-11d --server <uuid> --project <uuid>
coolify-11d apps start <uuid>
coolify-11d apps logs <uuid> --follow
coolify-11d apps envs list <uuid>
coolify-11d apps envs create <uuid> --key DB_HOST --value localhost

# Databases
coolify-11d db list
coolify-11d db create postgres --name pg-main-11d --server <uuid> --project <uuid>
coolify-11d db start <uuid>
coolify-11d db backups list <uuid>

# Services
coolify-11d svc list
coolify-11d svc create --type plausible --name analytics-11d
coolify-11d svc restart <uuid>

# Deployments
coolify-11d deploy trigger --uuid <app-uuid>
coolify-11d deploy trigger --tag production
coolify-11d deploy list --limit 10

# Servers
coolify-11d server list
coolify-11d server resources <uuid>
coolify-11d server domains <uuid>

# Projects
coolify-11d project list
coolify-11d project create --name "My Project"
coolify-11d project envs list <uuid>

# Batch / Composite (power-user)
coolify-11d batch restart-all --project <uuid>    # restart all apps in project
coolify-11d batch stop-all --server <uuid>        # emergency stop
coolify-11d status                                 # overview dashboard
```

### 9.4 Output Formats

- `table` (default) — Pretty-printed ASCII table
- `json` — Raw JSON (piping-friendly)
- `minimal` — One-line-per-resource summary
- `yaml` — YAML output for config pipelines

---

## 10. MCP Tool Definitions

### 10.1 Tool Design Principles

1. **One tool per API operation** — No compound tools that hide multiple API calls.
2. **Descriptive names** — `list_applications`, not `listApps` or `apps`.
3. **Input validation** — Zod schemas for all tool inputs.
4. **Compact defaults** — Return optimized responses unless `verbosity: "full"` is specified.
5. **Confirmation for destructive ops** — `delete_*` and `stop_all_*` tools require an explicit `confirm: true` parameter.

### 10.2 Example Tool Definition

```typescript
{
  name: "list_applications",
  description: "List all applications across the Coolify instance. Returns compact summaries by default. Use verbosity='full' for complete API response.",
  inputSchema: {
    type: "object",
    properties: {
      verbosity: {
        type: "string",
        enum: ["compact", "standard", "full"],
        default: "compact",
        description: "Response detail level"
      },
      server_uuid: {
        type: "string",
        description: "Filter by server UUID"
      },
      project_uuid: {
        type: "string",
        description: "Filter by project UUID"
      },
      status: {
        type: "string",
        enum: ["running", "stopped", "building", "error"],
        description: "Filter by application status"
      }
    }
  }
}
```

### 10.3 Composite / Power Tools

Beyond 1:1 API mappings, include these high-value composite tools:

| Tool | Description |
|---|---|
| `status_overview` | Returns a compact dashboard: server count, app count by status, recent deployments, resource health |
| `search_resources` | Fuzzy search across all resource types by name, domain, or IP |
| `restart_project_apps` | Restart all applications in a given project |
| `bulk_env_update` | Upsert an environment variable across multiple applications |
| `emergency_stop_all` | Stop all running applications (requires `confirm: true`) |
| `redeploy_project` | Force-rebuild and redeploy all applications in a project |
| `rename_resource` | Apply 11d naming convention to an existing resource |

---

## 11. Technology Stack

| Component | Technology | Rationale |
|---|---|---|
| Language | TypeScript 5.x | Type safety, MCP SDK compatibility, npm ecosystem |
| Runtime | Node.js 22 LTS | Native fetch, stable ESM, performance |
| MCP SDK | `@modelcontextprotocol/sdk` | Official SDK, stdio + SSE transport |
| CLI Framework | `commander` | Lightweight, subcommand-native, widely adopted |
| HTTP Client | Native `fetch` | Zero-dependency, built into Node 22 |
| Validation | `zod` | Runtime type validation for tool inputs |
| Config | `conf` or `cosmiconfig` | XDG-compliant config management |
| Container | Docker (Alpine-based) | Minimal image size (~50MB) |
| Setup UI | Vanilla HTML/CSS/JS or Preact | Minimal bundle, no build step for UI |
| Testing | Vitest | Fast, TypeScript-native |
| Build | `tsup` | Fast bundling, ESM + CJS output |
| Linting | Biome | Fast, all-in-one linter/formatter |

---

## 12. Security Considerations

1. **Token storage** — CLI stores tokens encrypted at rest in `~/.config/coolify-11d/config.json`. Use OS keychain integration where available (via `keytar`).
2. **Token in Docker** — Pass via environment variable. Never bake into image.
3. **Permission validation** — On startup, the tool calls a lightweight endpoint to detect token scope. Warn if insufficient.
4. **Sensitive data redaction** — In MCP responses, redact passwords and keys by default unless the token has `read:sensitive` or `*` scope AND the user explicitly requests full verbosity.
5. **HTTPS enforcement** — Warn if `base_url` uses HTTP in production contexts.
6. **Destructive operation guards** — All `DELETE` and bulk-stop operations require explicit confirmation in both CLI (interactive prompt) and MCP (`confirm: true` parameter).

---

## 13. Development Phases

### Phase 1: Core + CLI (Week 1-2)

- [ ] Project scaffolding (TypeScript, tsup, Vitest, Biome)
- [ ] Core API client with full endpoint coverage
- [ ] Naming convention engine
- [ ] Response optimizer (3 verbosity levels)
- [ ] Auth manager with permission detection
- [ ] CLI with all P0 commands
- [ ] Unit tests for core engine
- [ ] Integration tests against live Coolify instance
- [ ] npm package publication as `coolify-11d`

### Phase 2: MCP Server (Week 2-3)

- [ ] MCP server with stdio transport
- [ ] All P0 MCP tools
- [ ] Composite/power tools
- [ ] MCP resource endpoints
- [ ] Claude Code integration config
- [ ] Claude Desktop integration config
- [ ] VS Code / Cursor / Windsurf config examples
- [ ] P1 tools implementation

### Phase 3: Containerized Connector (Week 3-4)

- [ ] SSE transport implementation
- [ ] Express/Fastify HTTP server
- [ ] Setup UI (connection form, test, status)
- [ ] Dockerfile + docker-compose.yml
- [ ] MetaMCP compatibility testing
- [ ] GHCR image publication
- [ ] Coolify self-deployment recipe (deploy coolify-11d on Coolify itself)
- [ ] P2 tools implementation

### Phase 4: Polish & Distribution (Week 4-5)

- [ ] Comprehensive README with screenshots
- [ ] API documentation (auto-generated from tool schemas)
- [ ] Error handling hardening
- [ ] Rate limiting / retry logic
- [ ] Homebrew formula (stretch goal)
- [ ] Claude.ai connector registration (if Anthropic opens connector marketplace)

---

## 14. Testing Strategy

### 14.1 Unit Tests

- Core API client methods (mock HTTP)
- Naming convention engine (pure function tests)
- Response optimizer transformations
- CLI argument parsing
- MCP tool input validation

### 14.2 Integration Tests

- Live API calls against `https://xyz.v3ct0r.one` (gated behind env flag)
- Full CRUD lifecycle: create → read → update → delete
- Naming convention enforcement on create
- Token permission scope detection

### 14.3 E2E Tests

- CLI: Run commands, assert stdout/exit codes
- MCP: Spawn server, send tool calls via MCP client, assert responses
- Connector: Start container, hit SSE endpoint, validate MCP handshake

---

## 15. Success Metrics

1. **100% API coverage** — Every documented Coolify API endpoint is accessible via CLI and MCP.
2. **< 2KB average MCP response** — Compact mode responses stay under 2KB per entity (vs. 47KB+ raw).
3. **< 50MB Docker image** — Alpine-based, minimal dependencies.
4. **< 500ms cold start** — MCP server ready to accept tool calls within 500ms.
5. **Zero manual naming** — No resource ever deployed with a `supabase-<SHA>` name through this tool.

---

## 16. Open Questions

1. **API Token Permissions** — The current token returns "You are not allowed to access the API" on data endpoints even after calling `/enable`. Need to regenerate with `*` scope via Coolify UI (Keys & Tokens → API tokens → set permission to `*`).
2. **Coolify Version Compatibility** — Target v4.0.0-beta.380+ (same as `wrediam/coolify-mcp-server`). Need to confirm exact version running on `xyz.v3ct0r.one`.
3. **SSE Authentication for Connector** — How should the connector authenticate incoming MCP clients? Options: static bearer token, API key in query string, or proxy-level auth.
4. **Naming Collision Handling** — What happens if `my-app-11d` already exists and a new `create` is requested? Options: fail with error, auto-increment to `my-app-11d-01`, or prompt user.

---

## 17. Appendix

### A. Coolify API Base Reference

```
Base URL:     https://xyz.v3ct0r.one/api/v1
Health:       https://xyz.v3ct0r.one/api/health
Auth Header:  Authorization: Bearer <TOKEN>
Token Format: <id>|<hash> (Laravel Sanctum)
Docs:         https://coolify.io/docs/api-reference/authorization
```

### B. Sample cURL Commands

```bash
# Health check (no auth)
curl https://xyz.v3ct0r.one/api/health

# Enable API
curl https://xyz.v3ct0r.one/api/v1/enable \
  -H "Authorization: Bearer 3|tRnsRBxRCb79ATXEX0XWS0qdzW9KPGtYcynCXxiZa3af3d1f"

# List applications
curl https://xyz.v3ct0r.one/api/v1/applications \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Accept: application/json"

# Get specific application
curl https://xyz.v3ct0r.one/api/v1/applications/<uuid> \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Accept: application/json"

# Create PostgreSQL database
curl -X POST https://xyz.v3ct0r.one/api/v1/databases/postgresql \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"server_uuid": "<uuid>", "project_uuid": "<uuid>", "environment_name": "production"}'
```

### C. Existing MCP Server References (Competitive Analysis)

- `https://github.com/StuMason/coolify-mcp` — Best token optimization, 38 tools
- `https://github.com/wrediam/coolify-mcp-server` — npm package, v4.0.0-beta.380+ compat
- `https://github.com/dazeb/coolify-mcp-enhanced` — Enhanced feature set
- `https://github.com/FelixAllistar/coolify-mcp` — Includes partial CLI, 100% API coverage claim
- `https://github.com/Ruashots/coolify-mcp` — Clean install script
- `https://github.com/Thedurancode/Coolify-MCP` — AI-driven marketplace angle

### D. File Structure

```
coolify-11d/
├── src/
│   ├── core/
│   │   ├── api-client.ts          # HTTP client for Coolify API
│   │   ├── naming.ts              # 11d naming convention engine
│   │   ├── optimizer.ts           # Response optimization
│   │   ├── auth.ts                # Token management & permissions
│   │   └── types.ts               # TypeScript interfaces
│   ├── cli/
│   │   ├── index.ts               # CLI entry point
│   │   ├── commands/              # One file per resource group
│   │   │   ├── apps.ts
│   │   │   ├── db.ts
│   │   │   ├── svc.ts
│   │   │   ├── deploy.ts
│   │   │   ├── server.ts
│   │   │   ├── project.ts
│   │   │   ├── team.ts
│   │   │   ├── keys.ts
│   │   │   ├── system.ts
│   │   │   └── batch.ts
│   │   └── formatters/
│   │       ├── table.ts
│   │       ├── json.ts
│   │       └── minimal.ts
│   ├── mcp/
│   │   ├── server.ts              # MCP server entry
│   │   ├── tools.ts               # Tool definitions
│   │   ├── resources.ts           # MCP resource endpoints
│   │   └── composites.ts          # Power/composite tools
│   └── connector/
│       ├── server.ts              # Express + SSE server
│       ├── ui/
│       │   └── index.html         # Setup UI (single file)
│       └── middleware/
│           └── auth.ts            # Connector auth middleware
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── biome.json
├── Makefile
├── README.md
└── LICENSE
```
