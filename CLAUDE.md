# CLAUDE.md — coolify-11d project memory

> Persistent context for Claude sessions on this repo. Read this first on every resume.

**Last updated:** PR #2 merged to branch `feat/core-foundations` and pushed to origin.
**Next step:** PR #3 — Naming + Optimizer (rename-on-create hook, full redaction rules, collision retry, <2 KB compact assert).

---

## 1. Project

**Name:** coolify-11d
**Spec:** [`PRD-01-coolify-11d.md`](./PRD-01-coolify-11d.md)
**Author:** Marcus (v3ct0r)
**Target Coolify instance:** `https://xyz.v3ct0r.one` (v4.0.0-beta.380+)

**Three surfaces from one TS codebase:**
1. **CLI** — `coolify-11d apps list` …
2. **MCP server** — stdio transport for Claude Desktop/Code, Cursor, Windsurf, VS Code
3. **SSE Connector** — containerized remote MCP with setup UI (port 3111), MetaMCP / Claude.ai compatible

**Opinionated naming:** replace Coolify's `supabase-<SHA>` auto-names with `<name>-11d` (or `-11d-NN`, 01–40).

---

## 2. Stack (locked)

- Node 22 LTS · TypeScript 5 · ESM only
- `@modelcontextprotocol/sdk ^1.29` (stdio + SSE)
- `commander` · `zod` · `conf` · native `fetch`
- `tsup` (2-config split: executables with shebang, library without)
- `vitest` + `msw` · `biome` (lint + format, no eslint/prettier)
- `express` (connector)
- Alpine Docker multi-stage · GHCR + npm + Render Web Service
- Optional `keytar` for OS keychain token storage

---

## 3. Git state

**Remote:** `git@github.com:mbergo/coolify-mcp-server.git`

**Branches:**
- `main` — PR #1 (scaffold) merged, commit `1bdb9ba Scaffold Added`
- `feat/core-foundations` — PR #2 pushed, 2 commits on top of main

**Commit signing:**
- Configured globally: `commit.gpgsign=true`, `gpg.format=ssh`, SSH signing key is the inline RSA public key
- Signer: 1Password `op-ssh-sign`
- **Agent sock mismatch:** default `SSH_AUTH_SOCK=/run/user/1000/keyring/ssh` (GNOME keyring). 1Password signing requires `SSH_AUTH_SOCK=/home/mbergo/.1password/agent.sock`
- **Always prefix sign commands:** `SSH_AUTH_SOCK=/home/mbergo/.1password/agent.sock git commit -S ...`
- `git log --format="%G?"` shows `N` locally because no `allowedSignersFile` is configured — this is **cosmetic**. Raw `git cat-file -p HEAD` shows `gpgsig` block present. GitHub verifies signatures from the SSH key registered on the user's account.
- Do **not** modify local `.git/config`, do **not** set `gpg.ssh.allowedSignersFile` globally (user wanted no local config drift).

**Pushed state:**
```
main:                  1bdb9ba Scaffold Added
feat/core-foundations: 2bf1c4a ci: harden workflows — secret-gated integration, tighter test scope
                       1c9d0a7 feat(core): PR #2 — full API client, retry/backoff, auto-enable, scope detection, persistent config
                       1bdb9ba Scaffold Added
```

---

## 4. Repo layout

```
coolify-11d/
├── src/
│   ├── core/              # transport-agnostic engine
│   │   ├── api-client.ts      # CoolifyApiClient + 13 namespaces
│   │   ├── naming.ts          # -11d suffix logic (stub — expand in PR #3)
│   │   ├── optimizer.ts       # compact/standard/full (stub — expand in PR #3)
│   │   ├── auth.ts            # probeTokenScope, ensureApiEnabled
│   │   ├── config.ts          # conf-backed + env overlay
│   │   ├── types.ts           # entity + create-input shapes
│   │   └── index.ts           # barrel
│   ├── cli/
│   │   ├── index.ts           # commander entry (system health/version/enable-api, init stub)
│   │   ├── commands/          # (empty — fills in PR #5)
│   │   └── formatters/        # (empty — fills in PR #5)
│   ├── mcp/
│   │   └── server.ts          # McpServer + system_health/system_version tools
│   ├── connector/
│   │   ├── server.ts          # Express + /api/status + bearer auth + /mcp/sse stub
│   │   ├── ui/index.html      # themed setup page
│   │   └── middleware/        # (empty — fills in PR #9)
│   └── index.ts               # library barrel → core/
├── tests/
│   ├── unit/                  # 46 tests (naming 9, api-client 21, auth 7, config 9)
│   ├── integration/           # empty — populated in PR #4+
│   └── e2e/                   # empty — populated in PR #6+
├── .github/workflows/
│   ├── ci.yml                 # lint+typecheck+unit+build+CLI-smoke, secret-gated integration
│   ├── docker.yml             # multi-arch GHCR on v*.*.* tags
│   ├── release.yml            # npm publish on v*.*.* tags (tests/unit only)
│   └── render-deploy.yml      # Render Blueprint deploy on main push
├── Dockerfile                 # multi-stage Alpine, non-root, healthcheck
├── docker-compose.yml
├── .dockerignore
├── render.yaml                # Render Blueprint (runtime: docker, plan: starter)
├── Makefile                   # 40 targets (help auto-generated)
├── package.json               # bins: coolify-11d, coolify-11d-mcp
├── tsconfig.json
├── tsup.config.ts             # split config: executables (shebang) + library
├── biome.json
├── vitest.config.ts
├── .env.example · .gitignore · LICENSE · README.md
├── PRD-01-coolify-11d.md
└── CLAUDE.md                  # this file
```

---

## 5. PR sequence (plan)

| # | Scope | Status |
|---|---|---|
| **1** | Scaffold (layout, tooling, Makefile, Docker, Render, CI, stubs) | ✅ merged to `main` |
| **2** | Core foundations: full api-client + retry/backoff + auto-enable + scope probe + persistent config | ✅ pushed on `feat/core-foundations` |
| **3** | Naming engine + Optimizer: rename-on-create hook, redaction, collision policy, <2 KB compact assert | **← NEXT** |
| 4 | Expose all P0/P1 resource coverage through api-client (extra create flavours, backups, service envs) | pending |
| 5 | CLI P0 — commander commands, formatters (table/json/minimal/yaml), interactive `init` wizard | pending |
| 6 | MCP P0 — stdio server, full tool registry, resources (`coolify://...`) | pending |
| 7 | MCP P1 + composite tools (`status_overview`, `search_resources`, `emergency_stop_all`, …) | pending |
| 8 | P2 coverage — teams, keys, cloud-tokens, github-apps, hetzner, batch | pending |
| 9 | Connector — Express SSE, setup UI wiring, bearer auth middleware | pending |
| 10 | Polish — docs, hardening, GHCR + npm publish, Render deploy verified | pending |

Pause for review after PR #5, #7, #9.

---

## 6. What's done so far (summary of PR #1 + PR #2)

### PR #1 — Scaffold (commit `1bdb9ba` on main)

- Full repo layout + 40-target Makefile (`dev`, `prod`, `test`, `docker-*`, `render-*`, `release-*`)
- Dockerfile (multi-stage Alpine, non-root, healthcheck `/api/status`)
- `render.yaml` Blueprint (docker runtime, starter plan, oregon region)
- 4 GitHub Actions workflows (CI, docker GHCR, npm release, Render deploy)
- Source stubs: core/cli/mcp/connector enough to compile + smoke-boot
- 18 unit tests (smoke)

### PR #2 — Core foundations (commits `1c9d0a7` + `2bf1c4a` on `feat/core-foundations`)

**api-client.ts:**
- 13 resource namespaces (`system`, `apps`, `db`, `svc`, `deploy`, `server`, `project`, `team`, `keys`, `resources`, `github`, `cloud`, `hetzner`) mapping every PRD §6 endpoint
- Exp backoff retry on 5xx/408/429 (configurable `retries`, `retryBaseMs`, injectable `sleep`)
- Auto-recovery: one-shot `GET /api/v1/enable` on "API disabled" 401/403, then retry original request. Guard prevents loops
- `CoolifyApiError.isApiDisabled()` helper
- Injectable `fetch` for unit tests

**types.ts:**
- Full entity shapes (Application/Database/Service/Deployment/Server/Project/EnvVar/ResourceRef)
- Create-input shapes for every app flavour + every database engine
- `TokenScope`, `Verbosity`, `OutputFormat`, `NamingCollisionPolicy` enums

**auth.ts:**
- `probeTokenScope(client)` → `{ scope, canRead, canReadSensitive, canWrite, apiEnabled, notes }`
- Three read-only probes: `/teams/current`, `/applications`, `/security/keys`
- Classifies as `read-only` | `read:sensitive` | `*` | `unknown`
- `ensureApiEnabled` idempotent (swallows 400/404)

**config.ts:**
- `conf`-backed XDG-compliant store at `~/.config/coolify-11d/`
- Encrypted token-at-rest (`COOLIFY_11D_ENC_KEY` env or default)
- Precedence: env > `fileOverride` arg > persistent store > defaults
- Exports: `resolveConfig`, `setConfigValue`, `getConfigValue`, `clearConfig`, `configFilePath`, `resetStoreForTests`

**Unit tests — 46/46 passing** (`tests/unit/`):
- `naming.test.ts` (9) — suffix application, SHA detection, validators
- `api-client.test.ts` (21) — construction, retry semantics (5xx/429/404/max), auto-enable (success/guard/non-disabled 403), namespace URL shapes, query-string serialization
- `auth.test.ts` (7) — scope classification (* / read-only / unknown / api-disabled), `ensureApiEnabled` branches
- `config.test.ts` (9) — env overlay, defaults, invalid env fallback, persistent store roundtrip

**CI hardening:**
- Concurrency group (duplicate ref runs auto-cancel)
- Unit-only filter (`tests/unit`) so empty integration dir can't fail
- CLI smoke test step
- Integration job gated on secret presence — emits `::warning::` and skips when absent
- `--passWithNoTests` on integration target

---

## 7. Known quirks & gotchas

1. **Biome `noDelete` on env vars:** never use `delete process.env.X` — biome auto-rewrites to `= undefined` which coerces to the string `"undefined"` in Node. Use `Reflect.deleteProperty(process.env, key)` (see `tests/unit/config.test.ts`).

2. **tsup shebang:** split config in `tsup.config.ts` — executables (`cli.js`, `mcp.js`) get shebang via `banner.js`, library entries (`index.js`, `connector/server.js`) don't.

3. **Makefile help regex:** target names containing digits (e.g. `test-e2e`) need `[a-zA-Z0-9_-]+` in the awk pattern, not `[a-zA-Z_-]+`.

4. **Connector bind host:** when `CONNECTOR_AUTH_TOKEN` is unset, binds to `127.0.0.1` only with stderr warning. Production deployment MUST set the env var.

5. **Auto-enable single-shot:** `CoolifyApiClient.apiEnableAttempted` is a per-instance latch — recreating the client resets it. Tests rely on this.

6. **Scope probe can't distinguish `*` from `read:sensitive` safely** (would need a write probe). Current heuristic: sensitive reads succeeding ⇒ assume `*`, but note caveats in `notes[]` so UI can show warnings. Writes may still 403.

7. **Coolify API token on `xyz.v3ct0r.one`** currently returns "You are not allowed to access the API" on data endpoints — needs regeneration with `*` scope via Coolify UI → Keys & Tokens → API tokens (PRD Open Q §16.1).

---

## 8. Local dev commands (cheatsheet)

```bash
make install           # deps
make dev               # connector with hot reload on :3111
make dev-mcp           # MCP stdio server (for Claude Desktop testing)
make dev-cli ARGS="system health"

make check             # biome + tsc --noEmit
make test              # unit tests (46/46)
make test-integration  # live API (needs COOLIFY_TOKEN)
make test-e2e          # CLI + MCP + connector
make coverage          # unit coverage report

make build             # tsup
make docker-build      # Docker image
make compose-up

make render-install    # install Render CLI (brew or linux binary)
make render-validate   # render blueprints validate render.yaml
make render-create     # one-time service create (needs RENDER_API_KEY)
make render-deploy     # render deploys create $RENDER_SERVICE_ID --wait
make render-logs       # tail Render logs

make help              # full list
```

---

## 9. Secrets to configure (repo settings)

- `NPM_TOKEN` — for `.github/workflows/release.yml` (npm publish with provenance)
- `COOLIFY_BASE_URL` + `COOLIFY_TOKEN` — for `.github/workflows/ci.yml` integration job (environment: `coolify-live`)
- `RENDER_API_KEY` + `RENDER_SERVICE_ID` — for `.github/workflows/render-deploy.yml` (environment: `render`)

GHCR uses `GITHUB_TOKEN` (built-in, no setup).

---

## 10. Resuming a session — checklist

1. `git fetch --all --prune`
2. `git checkout feat/core-foundations` (or latest branch)
3. `git pull --ff-only`
4. `cat CLAUDE.md` (this file) — already in your context
5. `make install` if deps stale
6. `make check && make test` — sanity (should be 46/46)
7. Read last commit message: `git log -1`
8. Resume work on the PR marked **← NEXT** in section 5

For signed commits: prefix with `SSH_AUTH_SOCK=/home/mbergo/.1password/agent.sock git commit -S ...`. Accept the `N` in local `%G?` — it's cosmetic.

---

## 11. Resolved design decisions (lock-in)

- **Collision policy default:** `increment` (PRD Open Q §16.4 resolved)
- **Connector auth:** static bearer via `CONNECTOR_AUTH_TOKEN` env; unset → localhost-only bind (PRD Open Q §16.3 resolved)
- **Coolify version:** target v4.0.0-beta.380+; surface live version via `system_version` tool/command
- **MCP SDK pin:** `^1.29` stable 1.x; not jumping to `2.0-alpha` until it's stable
- **Render runtime:** `docker` (reuses our Dockerfile, no duplicate build pipeline)
- **Config encryption:** machine-stable key via `COOLIFY_11D_ENC_KEY` env (fallback to a constant, not high-security — real hardening is `keytar` integration planned post-MVP)

---

## 12. Out of scope (tracked, not built)

- Homebrew formula (stretch)
- Claude.ai connector marketplace submission (depends on Anthropic)
- Full web dashboard beyond setup page
- Non-Coolify infra providers
- `keytar` OS keychain integration (optional dep reserved, wired post-MVP)
