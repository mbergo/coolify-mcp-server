/**
 * TypeScript types for Coolify API entities.
 *
 * Shapes derived from the Coolify OpenAPI schema (v4.0.0-beta.380+).
 * Compact variants are the optimizer's target output (PRD §7).
 */

// ========================================================
// Auth / config primitives
// ========================================================

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
  /** Base retry delay in ms (exponential backoff multiplies). Default: 250. */
  retryBaseMs?: number;
  /** Auto-invoke `/enable` on "API disabled" errors and retry once. Default: true. */
  autoEnableApi?: boolean;
  /** Consecutive 5xx failures that trip the circuit breaker. Default: 5. */
  breakerThreshold?: number;
  /** How long the breaker stays open before allowing a probe. Default: 30_000. */
  breakerCooldownMs?: number;
  /** Custom fetch (for tests). */
  fetch?: typeof fetch;
  /** Custom sleep (for tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Custom wall clock (for tests). */
  now?: () => number;
}

export interface CoolifyErrorShape {
  status: number;
  endpoint: string;
  method: string;
  body?: unknown;
  requestId?: string;
}

// ========================================================
// Application
// ========================================================

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

export type BuildPack = "nixpacks" | "static" | "dockerfile" | "dockercompose" | "dockerimage";

export interface CreateApplicationBase {
  project_uuid: string;
  server_uuid: string;
  environment_name?: string;
  environment_uuid?: string;
  name?: string;
  description?: string;
  instant_deploy?: boolean;
}

export interface CreatePublicAppInput extends CreateApplicationBase {
  git_repository: string;
  git_branch: string;
  build_pack: BuildPack;
  ports_exposes?: string;
  domains?: string;
}

export interface CreateDockerfileAppInput extends CreateApplicationBase {
  dockerfile: string;
  ports_exposes?: string;
  domains?: string;
}

export interface CreateDockerImageAppInput extends CreateApplicationBase {
  docker_registry_image_name: string;
  docker_registry_image_tag?: string;
  ports_exposes?: string;
  domains?: string;
}

export interface CreateDockerComposeAppInput extends CreateApplicationBase {
  docker_compose_raw: string;
  domains?: string;
}

export interface CreateGithubAppInput extends CreateApplicationBase {
  github_app_uuid: string;
  git_repository: string;
  git_branch: string;
  build_pack: BuildPack;
  ports_exposes?: string;
}

export interface CreateDeployKeyAppInput extends CreateApplicationBase {
  private_key_uuid: string;
  git_repository: string;
  git_branch: string;
  build_pack: BuildPack;
  ports_exposes?: string;
}

// ========================================================
// Database
// ========================================================

export type DatabaseEngine =
  | "postgresql"
  | "mysql"
  | "mariadb"
  | "mongodb"
  | "redis"
  | "clickhouse"
  | "dragonfly"
  | "keydb";

export interface DatabaseCompact {
  uuid: string;
  name: string;
  status: string;
  type: DatabaseEngine | string;
  image?: string;
  public_port?: number;
  is_public?: boolean;
  server_name?: string;
  project_name?: string;
  environment?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateDatabaseBase {
  server_uuid: string;
  project_uuid: string;
  environment_name?: string;
  environment_uuid?: string;
  name?: string;
  description?: string;
  image?: string;
  is_public?: boolean;
  public_port?: number;
  instant_deploy?: boolean;
}

// ========================================================
// Service
// ========================================================

export interface ServiceCompact {
  uuid: string;
  name: string;
  status: string;
  service_type?: string;
  destination_type?: string;
  server_name?: string;
  project_name?: string;
  environment?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateServiceInput {
  server_uuid: string;
  project_uuid: string;
  environment_name?: string;
  environment_uuid?: string;
  type: string;
  name?: string;
  description?: string;
  instant_deploy?: boolean;
}

// ========================================================
// Deployment
// ========================================================

export interface DeploymentCompact {
  uuid: string;
  application_uuid: string;
  status: string;
  commit?: string;
  pull_request_id?: number | null;
  created_at: string;
  updated_at: string;
}

// ========================================================
// Server
// ========================================================

export interface ServerCompact {
  uuid: string;
  name: string;
  ip: string;
  port?: number;
  user?: string;
  is_reachable?: boolean;
  is_usable?: boolean;
  description?: string;
}

export interface CreateServerInput {
  name: string;
  ip: string;
  port?: number;
  user?: string;
  private_key_uuid: string;
  description?: string;
  is_build_server?: boolean;
  instant_validate?: boolean;
}

// ========================================================
// Project
// ========================================================

export interface ProjectCompact {
  uuid: string;
  name: string;
  description?: string;
  environments?: { uuid: string; name: string }[];
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

// ========================================================
// Env variable
// ========================================================

export interface EnvVar {
  uuid?: string;
  key: string;
  value?: string;
  is_preview?: boolean;
  is_build_time?: boolean;
  is_literal?: boolean;
  is_multiline?: boolean;
  is_shown_once?: boolean;
}

// ========================================================
// Generic resource (for /resources and search)
// ========================================================

export interface ResourceRef {
  uuid: string;
  name: string;
  type: "application" | "database" | "service" | "server" | string;
  status?: string;
}
