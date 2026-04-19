/**
 * CoolifyApiClient — HTTP wrapper for the Coolify API.
 *
 * Features:
 *   • Bearer-token auth, JSON in/out
 *   • Exponential backoff retry on 5xx + network errors (configurable)
 *   • Auto-invoke `GET /api/v1/enable` once on "API disabled" responses
 *   • Typed resource namespaces: system, apps, db, svc, deploy, server,
 *     project, team, keys, resources, github, cloud, hetzner
 *
 * One method per PRD §6 endpoint. Grouped by resource to keep the public
 * surface flat.
 */

import type {
  ApplicationCompact,
  CoolifyClientOptions,
  CoolifyErrorShape,
  CreateApplicationBase,
  CreateDatabaseBase,
  CreateDeployKeyAppInput,
  CreateDockerComposeAppInput,
  CreateDockerImageAppInput,
  CreateDockerfileAppInput,
  CreateGithubAppInput,
  CreateProjectInput,
  CreatePublicAppInput,
  CreateServerInput,
  CreateServiceInput,
  DatabaseCompact,
  DeploymentCompact,
  EnvVar,
  ProjectCompact,
  ResourceRef,
  ServerCompact,
  ServiceCompact,
} from "./types.js";

// ----------------------------------------------------------------
// Error
// ----------------------------------------------------------------

export class CoolifyApiError extends Error implements CoolifyErrorShape {
  public readonly status: number;
  public readonly endpoint: string;
  public readonly method: string;
  public readonly body?: unknown;
  public readonly requestId?: string;

  constructor(shape: CoolifyErrorShape) {
    super(`Coolify API ${shape.method} ${shape.endpoint} → ${shape.status}`);
    this.name = "CoolifyApiError";
    this.status = shape.status;
    this.endpoint = shape.endpoint;
    this.method = shape.method;
    this.body = shape.body;
    this.requestId = shape.requestId;
  }

  /** True when Coolify reports "API disabled" — recoverable by calling /enable. */
  isApiDisabled(): boolean {
    if (this.status !== 401 && this.status !== 403) return false;
    const msg = extractErrorMessage(this.body).toLowerCase();
    return msg.includes("not allowed to access the api") || msg.includes("api is disabled");
  }
}

function extractErrorMessage(body: unknown): string {
  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>;
    if (typeof rec.message === "string") return rec.message;
    if (typeof rec.error === "string") return rec.error;
  }
  return "";
}

function isRetriableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ----------------------------------------------------------------
// Client
// ----------------------------------------------------------------

export class CoolifyApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryBaseMs: number;
  private readonly autoEnableApi: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly breakerThreshold: number;
  private readonly breakerCooldownMs: number;
  private readonly now: () => number;

  private apiEnableAttempted = false;

  // Circuit-breaker state — trips after N consecutive 5xx, stays tripped
  // for breakerCooldownMs before allowing one probe ("half-open").
  private consecutiveFailures = 0;
  private breakerOpenUntil = 0;

  // Resource namespaces — wired in constructor
  public readonly system: SystemNs;
  public readonly apps: ApplicationsNs;
  public readonly db: DatabasesNs;
  public readonly svc: ServicesNs;
  public readonly deploy: DeploymentsNs;
  public readonly server: ServersNs;
  public readonly project: ProjectsNs;
  public readonly team: TeamsNs;
  public readonly keys: KeysNs;
  public readonly resources: ResourcesNs;
  public readonly github: GithubNs;
  public readonly cloud: CloudNs;
  public readonly hetzner: HetznerNs;

  constructor(opts: CoolifyClientOptions) {
    if (!opts.baseUrl) throw new Error("baseUrl is required");
    if (!opts.token) throw new Error("token is required");
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.retries = opts.retries ?? 3;
    this.retryBaseMs = opts.retryBaseMs ?? 250;
    this.autoEnableApi = opts.autoEnableApi ?? true;
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.breakerThreshold = opts.breakerThreshold ?? 5;
    this.breakerCooldownMs = opts.breakerCooldownMs ?? 30_000;
    this.now = opts.now ?? (() => Date.now());

    this.system = new SystemNs(this);
    this.apps = new ApplicationsNs(this);
    this.db = new DatabasesNs(this);
    this.svc = new ServicesNs(this);
    this.deploy = new DeploymentsNs(this);
    this.server = new ServersNs(this);
    this.project = new ProjectsNs(this);
    this.team = new TeamsNs(this);
    this.keys = new KeysNs(this);
    this.resources = new ResourcesNs(this);
    this.github = new GithubNs(this);
    this.cloud = new CloudNs(this);
    this.hetzner = new HetznerNs(this);
  }

  // ----------------------------------------------------------------
  // Legacy convenience wrappers (kept for test/scaffold compatibility)
  // ----------------------------------------------------------------

  health(): Promise<string> {
    return this.system.health();
  }
  version(): Promise<string> {
    return this.system.version();
  }
  enableApi(): Promise<unknown> {
    return this.system.enableApi();
  }

  // ----------------------------------------------------------------
  // Core request helpers (used by namespaces)
  // ----------------------------------------------------------------

  /** Raw request to /api/health (no /api/v1 prefix, no auth needed). */
  async requestRoot<T>(method: string, path: string): Promise<T> {
    return this.runRequest<T>(method, path, { absolutePath: true });
  }

  /** JSON request against /api/v1{path} with auth, retry, auto-enable. */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const pathWithQuery = appendQuery(path, query);
    return this.runRequest<T>(method, pathWithQuery, { body });
  }

  private async runRequest<T>(
    method: string,
    path: string,
    opts: { body?: unknown; absolutePath?: boolean } = {},
  ): Promise<T> {
    // Circuit breaker gate — fail fast when tripped.
    if (this.breakerOpenUntil > this.now()) {
      const remainingMs = this.breakerOpenUntil - this.now();
      throw new CoolifyApiError({
        status: 503,
        endpoint: path,
        method,
        body: {
          error: "circuit_open",
          message: `Coolify API circuit breaker is open for another ${Math.ceil(remainingMs / 1000)}s after ${this.breakerThreshold} consecutive failures.`,
        },
      });
    }

    const url = opts.absolutePath ? `${this.baseUrl}${path}` : `${this.baseUrl}/api/v1${path}`;

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const result = await this.executeSingle<T>(method, url, path, opts.body);
        this.onSuccess();
        return result;
      } catch (err) {
        lastErr = err;

        if (err instanceof CoolifyApiError) {
          // Auto-enable API on first recoverable auth error
          if (
            !opts.absolutePath &&
            this.autoEnableApi &&
            !this.apiEnableAttempted &&
            err.isApiDisabled()
          ) {
            this.apiEnableAttempted = true;
            try {
              await this.executeSingle<unknown>("GET", `${this.baseUrl}/api/v1/enable`, "/enable");
            } catch {
              // swallow — if /enable itself fails, re-throw original
              throw err;
            }
            // Retry once (do not consume a retry slot)
            continue;
          }

          if (!isRetriableStatus(err.status)) throw err;

          // Count only server-side failures toward the breaker.
          this.onFailure();
        } else {
          // Network / fetch failures also count.
          this.onFailure();
        }

        if (attempt === this.retries) break;
        await this.sleep(this.computeBackoff(attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private async executeSingle<T>(
    method: string,
    url: string,
    loggedPath: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      };
      if (body !== undefined) headers["Content-Type"] = "application/json";

      const res = await this.fetchImpl(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        let errBody: unknown;
        try {
          const ct = res.headers.get("content-type") ?? "";
          errBody = ct.includes("application/json") ? await res.json() : await res.text();
        } catch {
          errBody = undefined;
        }
        throw new CoolifyApiError({
          status: res.status,
          endpoint: loggedPath,
          method,
          body: errBody,
          requestId: res.headers.get("x-request-id") ?? undefined,
        });
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        return (await res.json()) as T;
      }
      return (await res.text()) as unknown as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private computeBackoff(attempt: number): number {
    // Exponential with jitter: base * 2^attempt * (1 + random/2)
    const exp = this.retryBaseMs * 2 ** attempt;
    const jitter = Math.random() * exp * 0.5;
    return Math.round(exp + jitter);
  }

  /** Record a success → reset breaker counters. */
  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.breakerOpenUntil = 0;
  }

  /** Record a failure → maybe trip the breaker. */
  private onFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.breakerThreshold) {
      this.breakerOpenUntil = this.now() + this.breakerCooldownMs;
    }
  }

  /** Test hook — true when the breaker is currently open. */
  get circuitOpen(): boolean {
    return this.breakerOpenUntil > this.now();
  }

  /** Test hook. */
  get maxRetries(): number {
    return this.retries;
  }
}

// ----------------------------------------------------------------
// URL query helper
// ----------------------------------------------------------------

function appendQuery(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  if (!query) return path;
  const entries = Object.entries(query).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return path;
  const usp = new URLSearchParams();
  for (const [k, v] of entries) usp.set(k, String(v));
  return `${path}?${usp.toString()}`;
}

// ----------------------------------------------------------------
// Namespace implementations
// ----------------------------------------------------------------

class BaseNs {
  constructor(protected readonly client: CoolifyApiClient) {}
}

// ----- System -----
export class SystemNs extends BaseNs {
  version(): Promise<string> {
    return this.client.request<string>("GET", "/version");
  }
  health(): Promise<string> {
    return this.client.requestRoot<string>("GET", "/api/health");
  }
  enableApi(): Promise<unknown> {
    return this.client.request<unknown>("GET", "/enable");
  }
  disableApi(): Promise<unknown> {
    return this.client.request<unknown>("GET", "/disable");
  }
  healthcheck(): Promise<unknown> {
    return this.client.request<unknown>("GET", "/healthcheck");
  }
}

// ----- Applications -----
export class ApplicationsNs extends BaseNs {
  list(filters?: {
    server_uuid?: string;
    project_uuid?: string;
  }): Promise<ApplicationCompact[]> {
    return this.client.request<ApplicationCompact[]>("GET", "/applications", undefined, filters);
  }
  get(uuid: string): Promise<ApplicationCompact> {
    return this.client.request<ApplicationCompact>("GET", `/applications/${uuid}`);
  }
  delete(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("DELETE", `/applications/${uuid}`);
  }
  update(
    uuid: string,
    patch: Partial<ApplicationCompact> & Record<string, unknown>,
  ): Promise<unknown> {
    return this.client.request<unknown>("PATCH", `/applications/${uuid}`, patch);
  }

  // Create flavors
  createPublic(input: CreatePublicAppInput): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/applications/public", input);
  }
  createGithub(input: CreateGithubAppInput): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/applications/private-github-app", input);
  }
  createDeployKey(input: CreateDeployKeyAppInput): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/applications/private-deploy-key", input);
  }
  createDockerfile(input: CreateDockerfileAppInput): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/applications/dockerfile", input);
  }
  createDockerImage(input: CreateDockerImageAppInput): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/applications/dockerimage", input);
  }
  createDockerCompose(input: CreateDockerComposeAppInput): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/applications/dockercompose", input);
  }

  // Lifecycle
  start(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/applications/${uuid}/start`);
  }
  stop(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/applications/${uuid}/stop`);
  }
  restart(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/applications/${uuid}/restart`);
  }
  logs(uuid: string, lines?: number): Promise<unknown> {
    return this.client.request<unknown>("GET", `/applications/${uuid}/logs`, undefined, {
      lines,
    });
  }

  // Env vars
  envs(uuid: string): Promise<EnvVar[]> {
    return this.client.request<EnvVar[]>("GET", `/applications/${uuid}/envs`);
  }
  createEnv(uuid: string, env: EnvVar): Promise<unknown> {
    return this.client.request<unknown>("POST", `/applications/${uuid}/envs`, env);
  }
  updateEnv(uuid: string, env: EnvVar): Promise<unknown> {
    return this.client.request<unknown>("PATCH", `/applications/${uuid}/envs`, env);
  }
  bulkUpdateEnv(uuid: string, envs: EnvVar[]): Promise<unknown> {
    return this.client.request<unknown>("PATCH", `/applications/${uuid}/envs/bulk`, { envs });
  }
  deleteEnv(uuid: string, envUuid: string): Promise<unknown> {
    return this.client.request<unknown>("DELETE", `/applications/${uuid}/envs/${envUuid}`);
  }

  // Deployments
  deployments(uuid: string): Promise<DeploymentCompact[]> {
    return this.client.request<DeploymentCompact[]>("GET", `/applications/${uuid}/deployments`);
  }
}

// ----- Databases -----
export class DatabasesNs extends BaseNs {
  list(): Promise<DatabaseCompact[]> {
    return this.client.request<DatabaseCompact[]>("GET", "/databases");
  }
  get(uuid: string): Promise<DatabaseCompact> {
    return this.client.request<DatabaseCompact>("GET", `/databases/${uuid}`);
  }
  delete(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("DELETE", `/databases/${uuid}`);
  }
  update(
    uuid: string,
    patch: Partial<DatabaseCompact> & Record<string, unknown>,
  ): Promise<unknown> {
    return this.client.request<unknown>("PATCH", `/databases/${uuid}`, patch);
  }

  createPostgres(input: CreateDatabaseBase & Record<string, unknown>): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/databases/postgresql", input);
  }
  createMysql(input: CreateDatabaseBase & Record<string, unknown>): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/databases/mysql", input);
  }
  createMariadb(input: CreateDatabaseBase & Record<string, unknown>): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/databases/mariadb", input);
  }
  createMongodb(input: CreateDatabaseBase & Record<string, unknown>): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/databases/mongodb", input);
  }
  createRedis(input: CreateDatabaseBase & Record<string, unknown>): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/databases/redis", input);
  }
  createClickhouse(input: CreateDatabaseBase & Record<string, unknown>): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/databases/clickhouse", input);
  }
  createDragonfly(input: CreateDatabaseBase & Record<string, unknown>): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/databases/dragonfly", input);
  }
  createKeydb(input: CreateDatabaseBase & Record<string, unknown>): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/databases/keydb", input);
  }

  start(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/databases/${uuid}/start`);
  }
  stop(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/databases/${uuid}/stop`);
  }
  restart(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/databases/${uuid}/restart`);
  }

  // Backups
  backupsList(uuid: string): Promise<unknown[]> {
    return this.client.request<unknown[]>("GET", `/databases/${uuid}/backups`);
  }
  backupCreate(uuid: string, payload: Record<string, unknown>): Promise<unknown> {
    return this.client.request<unknown>("POST", `/databases/${uuid}/backups`, payload);
  }
  backupUpdate(uuid: string, patch: Record<string, unknown>): Promise<unknown> {
    return this.client.request<unknown>("PATCH", `/databases/${uuid}/backups`, patch);
  }
  backupDelete(uuid: string, backupUuid: string): Promise<unknown> {
    return this.client.request<unknown>("DELETE", `/databases/${uuid}/backups/${backupUuid}`);
  }
  backupExecutions(uuid: string): Promise<unknown[]> {
    return this.client.request<unknown[]>("GET", `/databases/${uuid}/backups/executions`);
  }
  backupExecutionDelete(uuid: string, execUuid: string): Promise<unknown> {
    return this.client.request<unknown>(
      "DELETE",
      `/databases/${uuid}/backups/executions/${execUuid}`,
    );
  }
}

// ----- Services -----
export class ServicesNs extends BaseNs {
  list(): Promise<ServiceCompact[]> {
    return this.client.request<ServiceCompact[]>("GET", "/services");
  }
  get(uuid: string): Promise<ServiceCompact> {
    return this.client.request<ServiceCompact>("GET", `/services/${uuid}`);
  }
  create(input: CreateServiceInput): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/services", input);
  }
  delete(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("DELETE", `/services/${uuid}`);
  }
  update(uuid: string, patch: Record<string, unknown>): Promise<unknown> {
    return this.client.request<unknown>("PATCH", `/services/${uuid}`, patch);
  }

  start(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/services/${uuid}/start`);
  }
  stop(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/services/${uuid}/stop`);
  }
  restart(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/services/${uuid}/restart`);
  }

  envs(uuid: string): Promise<EnvVar[]> {
    return this.client.request<EnvVar[]>("GET", `/services/${uuid}/envs`);
  }
  createEnv(uuid: string, env: EnvVar): Promise<unknown> {
    return this.client.request<unknown>("POST", `/services/${uuid}/envs`, env);
  }
  updateEnv(uuid: string, env: EnvVar): Promise<unknown> {
    return this.client.request<unknown>("PATCH", `/services/${uuid}/envs`, env);
  }
  bulkUpdateEnv(uuid: string, envs: EnvVar[]): Promise<unknown> {
    return this.client.request<unknown>("PATCH", `/services/${uuid}/envs/bulk`, { envs });
  }
  deleteEnv(uuid: string, envUuid: string): Promise<unknown> {
    return this.client.request<unknown>("DELETE", `/services/${uuid}/envs/${envUuid}`);
  }
}

// ----- Deployments -----
export class DeploymentsNs extends BaseNs {
  list(limit?: number): Promise<DeploymentCompact[]> {
    return this.client.request<DeploymentCompact[]>("GET", "/deployments", undefined, { limit });
  }
  get(uuid: string): Promise<DeploymentCompact> {
    return this.client.request<DeploymentCompact>("GET", `/deployments/${uuid}`);
  }
  cancel(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("POST", `/deployments/${uuid}/cancel`);
  }
  trigger(opts: { uuid?: string; tag?: string; force?: boolean }): Promise<unknown> {
    return this.client.request<unknown>("GET", "/deploy", undefined, opts);
  }
}

// ----- Servers -----
export class ServersNs extends BaseNs {
  list(): Promise<ServerCompact[]> {
    return this.client.request<ServerCompact[]>("GET", "/servers");
  }
  get(uuid: string): Promise<ServerCompact> {
    return this.client.request<ServerCompact>("GET", `/servers/${uuid}`);
  }
  create(input: CreateServerInput): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/servers", input);
  }
  delete(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("DELETE", `/servers/${uuid}`);
  }
  update(uuid: string, patch: Record<string, unknown>): Promise<unknown> {
    return this.client.request<unknown>("PATCH", `/servers/${uuid}`, patch);
  }
  resources(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/servers/${uuid}/resources`);
  }
  domains(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/servers/${uuid}/domains`);
  }
  validate(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/servers/${uuid}/validate`);
  }
}

// ----- Projects -----
export class ProjectsNs extends BaseNs {
  list(): Promise<ProjectCompact[]> {
    return this.client.request<ProjectCompact[]>("GET", "/projects");
  }
  get(uuid: string): Promise<ProjectCompact> {
    return this.client.request<ProjectCompact>("GET", `/projects/${uuid}`);
  }
  create(input: CreateProjectInput): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/projects", input);
  }
  delete(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("DELETE", `/projects/${uuid}`);
  }
  update(uuid: string, patch: Record<string, unknown>): Promise<unknown> {
    return this.client.request<unknown>("PATCH", `/projects/${uuid}`, patch);
  }
  environments(uuid: string): Promise<unknown[]> {
    return this.client.request<unknown[]>("GET", `/projects/${uuid}/environments`);
  }
  getEnvironment(uuid: string, envName: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/projects/${uuid}/${envName}`);
  }
  createEnvironment(uuid: string, name: string): Promise<unknown> {
    return this.client.request<unknown>("POST", `/projects/${uuid}/environments`, { name });
  }
  deleteEnvironment(uuid: string, envName: string): Promise<unknown> {
    return this.client.request<unknown>("DELETE", `/projects/${uuid}/environments/${envName}`);
  }
}

// ----- Teams -----
export class TeamsNs extends BaseNs {
  list(): Promise<unknown[]> {
    return this.client.request<unknown[]>("GET", "/teams");
  }
  get(id: string | number): Promise<unknown> {
    return this.client.request<unknown>("GET", `/teams/${id}`);
  }
  members(id: string | number): Promise<unknown[]> {
    return this.client.request<unknown[]>("GET", `/teams/${id}/members`);
  }
  current(): Promise<unknown> {
    return this.client.request<unknown>("GET", "/teams/current");
  }
  currentMembers(): Promise<unknown[]> {
    return this.client.request<unknown[]>("GET", "/teams/current/members");
  }
}

// ----- Security keys -----
export class KeysNs extends BaseNs {
  list(): Promise<unknown[]> {
    return this.client.request<unknown[]>("GET", "/security/keys");
  }
  get(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/security/keys/${uuid}`);
  }
  create(payload: Record<string, unknown>): Promise<{ uuid: string }> {
    return this.client.request<{ uuid: string }>("POST", "/security/keys", payload);
  }
  update(uuid: string, patch: Record<string, unknown>): Promise<unknown> {
    return this.client.request<unknown>("PATCH", `/security/keys/${uuid}`, patch);
  }
  delete(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("DELETE", `/security/keys/${uuid}`);
  }
}

// ----- Resources (generic list) -----
export class ResourcesNs extends BaseNs {
  list(): Promise<ResourceRef[]> {
    return this.client.request<ResourceRef[]>("GET", "/resources");
  }
}

// ----- GitHub apps -----
export class GithubNs extends BaseNs {
  list(): Promise<unknown[]> {
    return this.client.request<unknown[]>("GET", "/github-apps");
  }
  create(payload: Record<string, unknown>): Promise<unknown> {
    return this.client.request<unknown>("POST", "/github-apps", payload);
  }
  delete(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("DELETE", `/github-apps/${uuid}`);
  }
  update(uuid: string, patch: Record<string, unknown>): Promise<unknown> {
    return this.client.request<unknown>("PATCH", `/github-apps/${uuid}`, patch);
  }
  repos(uuid: string): Promise<unknown[]> {
    return this.client.request<unknown[]>("GET", `/github-apps/${uuid}/repos`);
  }
  branches(uuid: string, owner: string, repo: string): Promise<unknown[]> {
    return this.client.request<unknown[]>(
      "GET",
      `/github-apps/${uuid}/repos/${owner}/${repo}/branches`,
    );
  }
}

// ----- Cloud tokens -----
export class CloudNs extends BaseNs {
  list(): Promise<unknown[]> {
    return this.client.request<unknown[]>("GET", "/cloud-tokens");
  }
  get(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("GET", `/cloud-tokens/${uuid}`);
  }
  create(payload: Record<string, unknown>): Promise<unknown> {
    return this.client.request<unknown>("POST", "/cloud-tokens", payload);
  }
  update(uuid: string, patch: Record<string, unknown>): Promise<unknown> {
    return this.client.request<unknown>("PATCH", `/cloud-tokens/${uuid}`, patch);
  }
  delete(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("DELETE", `/cloud-tokens/${uuid}`);
  }
  validate(uuid: string): Promise<unknown> {
    return this.client.request<unknown>("POST", `/cloud-tokens/${uuid}/validate`);
  }
}

// ----- Hetzner -----
export class HetznerNs extends BaseNs {
  locations(): Promise<unknown[]> {
    return this.client.request<unknown[]>("GET", "/hetzner/locations");
  }
  serverTypes(): Promise<unknown[]> {
    return this.client.request<unknown[]>("GET", "/hetzner/server-types");
  }
  images(): Promise<unknown[]> {
    return this.client.request<unknown[]>("GET", "/hetzner/images");
  }
  sshKeys(): Promise<unknown[]> {
    return this.client.request<unknown[]>("GET", "/hetzner/ssh-keys");
  }
  createServer(payload: Record<string, unknown>): Promise<unknown> {
    return this.client.request<unknown>("POST", "/hetzner/servers", payload);
  }
}

// Re-export the generic create input types for convenience
export type { CreateApplicationBase };
