/**
 * Response optimizer — three verbosity levels per entity (PRD §7).
 *
 *   compact  — ≤ 2 KB per entity, safe for MCP default
 *   standard — ~30 fields, default for CLI
 *   full     — raw API response, opt-in
 *
 * Sensitive fields (env values, passwords, private keys, tokens) are
 * redacted unless the token scope supports sensitive reads AND the caller
 * explicitly opts into verbosity="full".
 */

import type {
  ApplicationCompact,
  DatabaseCompact,
  DeploymentCompact,
  EnvVar,
  ProjectCompact,
  ServerCompact,
  ServiceCompact,
  TokenScope,
  Verbosity,
} from "./types.js";

// ----------------------------------------------------------------
// Redaction
// ----------------------------------------------------------------

/** Key names whose values must be redacted in non-full verbosity. */
const SENSITIVE_KEY_RE =
  /(password|passwd|secret|token|api[_-]?key|private[_-]?key|ssh[_-]?key|credential)/i;

const REDACTED = "***";

export interface RedactContext {
  verbosity: Verbosity;
  scope: TokenScope;
}

/** Returns true when sensitive values should be shown as-is. */
export function canRevealSensitive(ctx: RedactContext): boolean {
  if (ctx.verbosity !== "full") return false;
  return ctx.scope === "read:sensitive" || ctx.scope === "view:sensitive" || ctx.scope === "*";
}

/**
 * Recursively redact sensitive values in-place-safely (returns a new object).
 * Arrays and nested objects are walked. Primitives returned as-is.
 */
export function redact<T>(value: T, ctx: RedactContext): T {
  if (canRevealSensitive(ctx)) return value;
  return walkRedact(value) as T;
}

function walkRedact(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(walkRedact);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(k) && typeof val === "string" && val.length > 0) {
      out[k] = REDACTED;
    } else {
      out[k] = walkRedact(val);
    }
  }
  return out;
}

/** Env vars get special treatment: key stays visible, value redacted. */
export function redactEnvVar(env: EnvVar, ctx: RedactContext): EnvVar {
  if (canRevealSensitive(ctx)) return env;
  return { ...env, value: env.value ? REDACTED : env.value };
}

// ----------------------------------------------------------------
// Compact transforms (one per entity)
// ----------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: raw API payloads are dynamic
type Raw = any;

export function toApplicationCompact(raw: Raw): ApplicationCompact {
  return {
    uuid: raw.uuid,
    name: raw.name,
    status: raw.status ?? "unknown",
    fqdn: raw.fqdn,
    git_repository: raw.git_repository,
    git_branch: raw.git_branch,
    build_pack: raw.build_pack ?? "unknown",
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    server_name: raw.server?.name ?? raw.destination?.server?.name,
    project_name: raw.project?.name ?? raw.environment?.project?.name,
    environment: raw.environment?.name,
    ports_mappings: raw.ports_mappings,
    health_check_status: raw.health_check_status,
    deployment_status: raw.deployment_status,
  };
}

export function toDatabaseCompact(raw: Raw): DatabaseCompact {
  return {
    uuid: raw.uuid,
    name: raw.name,
    status: raw.status ?? "unknown",
    type: raw.type ?? raw.database_type ?? "unknown",
    image: raw.image,
    public_port: raw.public_port,
    is_public: raw.is_public,
    server_name: raw.server?.name ?? raw.destination?.server?.name,
    project_name: raw.project?.name ?? raw.environment?.project?.name,
    environment: raw.environment?.name,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export function toServiceCompact(raw: Raw): ServiceCompact {
  return {
    uuid: raw.uuid,
    name: raw.name,
    status: raw.status ?? "unknown",
    service_type: raw.service_type,
    destination_type: raw.destination_type,
    server_name: raw.server?.name ?? raw.destination?.server?.name,
    project_name: raw.project?.name ?? raw.environment?.project?.name,
    environment: raw.environment?.name,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export function toDeploymentCompact(raw: Raw): DeploymentCompact {
  return {
    uuid: raw.uuid ?? raw.deployment_uuid,
    application_uuid: raw.application_uuid ?? raw.application?.uuid,
    status: raw.status ?? "unknown",
    commit: raw.commit ?? raw.commit_sha,
    pull_request_id: raw.pull_request_id ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export function toServerCompact(raw: Raw): ServerCompact {
  return {
    uuid: raw.uuid,
    name: raw.name,
    ip: raw.ip,
    port: raw.port,
    user: raw.user,
    is_reachable: raw.is_reachable,
    is_usable: raw.is_usable,
    description: raw.description,
  };
}

export function toProjectCompact(raw: Raw): ProjectCompact {
  return {
    uuid: raw.uuid,
    name: raw.name,
    description: raw.description,
    environments: Array.isArray(raw.environments)
      ? raw.environments.map((e: Raw) => ({ uuid: e.uuid, name: e.name }))
      : undefined,
  };
}

// ----------------------------------------------------------------
// Standard transforms (compact + small extras, no heavy fields)
// ----------------------------------------------------------------

const HEAVY_FIELDS = new Set([
  // Heavy or noisy fields stripped from standard output.
  "docker_compose",
  "docker_compose_raw",
  "docker_compose_domains",
  "docker_compose_location",
  "manual_webhook_secret_github",
  "manual_webhook_secret_gitlab",
  "manual_webhook_secret_bitbucket",
  "manual_webhook_secret_gitea",
  "dockerfile",
  "dockerfile_location",
  "custom_nginx_configuration",
  "persistent_storages",
  "events",
]);

export function toStandard<T extends Record<string, unknown>>(raw: T): Partial<T> {
  if (!raw || typeof raw !== "object") return raw as Partial<T>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (HEAVY_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

// ----------------------------------------------------------------
// Verbosity dispatcher
// ----------------------------------------------------------------

export type EntityKind =
  | "application"
  | "database"
  | "service"
  | "deployment"
  | "server"
  | "project";

const COMPACT_BY_KIND: Record<EntityKind, (raw: Raw) => unknown> = {
  application: toApplicationCompact,
  database: toDatabaseCompact,
  service: toServiceCompact,
  deployment: toDeploymentCompact,
  server: toServerCompact,
  project: toProjectCompact,
};

export interface OptimizeOptions extends RedactContext {
  kind: EntityKind;
}

/** Apply verbosity + redaction to a single entity. */
export function optimizeEntity<T>(raw: Raw, opts: OptimizeOptions): T {
  const shaped =
    opts.verbosity === "compact"
      ? COMPACT_BY_KIND[opts.kind](raw)
      : opts.verbosity === "standard"
        ? toStandard(raw)
        : raw;
  return redact(shaped, opts) as T;
}

/** Apply to an array. */
export function optimizeList<T>(raws: Raw[], opts: OptimizeOptions): T[] {
  return raws.map((r) => optimizeEntity<T>(r, opts));
}

// ----------------------------------------------------------------
// Size guard (PRD §15.2: < 2 KB per compact entity)
// ----------------------------------------------------------------

export const COMPACT_MAX_BYTES = 2048;

export function jsonByteSize(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v), "utf8");
}

export function assertCompactSize(v: unknown, kind: EntityKind): void {
  const size = jsonByteSize(v);
  if (size > COMPACT_MAX_BYTES) {
    throw new Error(
      `Compact ${kind} exceeds ${COMPACT_MAX_BYTES}B budget (got ${size}B). Review compact transform — drop heavy fields.`,
    );
  }
}
