/**
 * TypeScript types for Coolify API entities.
 *
 * Stub — full type definitions derived from the Coolify OpenAPI schema
 * will land in PR #2 alongside the api-client implementation.
 */

export type TokenScope = "read-only" | "read:sensitive" | "view:sensitive" | "*" | "unknown";

export type Verbosity = "compact" | "standard" | "full";

export type OutputFormat = "table" | "json" | "minimal" | "yaml";

export type NamingCollisionPolicy = "error" | "increment" | "prompt";

export interface CoolifyClientOptions {
  baseUrl: string;
  token: string;
  /** Request timeout in milliseconds. Default: 30_000. */
  timeoutMs?: number;
  /** Max retry attempts on 5xx. Default: 3. */
  retries?: number;
  /** Custom fetch (for tests). */
  fetch?: typeof fetch;
}

export interface CoolifyErrorShape {
  status: number;
  endpoint: string;
  method: string;
  body?: unknown;
  requestId?: string;
}

/** Minimal Coolify application shape — full variant added in PR #2. */
export interface ApplicationCompact {
  uuid: string;
  name: string;
  status: string;
  fqdn?: string;
  git_repository?: string;
  git_branch?: string;
  build_pack: string;
  created_at: string;
  updated_at: string;
  server_name?: string;
  project_name?: string;
  environment?: string;
  ports_mappings?: string;
  health_check_status?: string;
  deployment_status?: string;
}
