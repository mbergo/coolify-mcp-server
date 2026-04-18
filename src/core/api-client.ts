/**
 * CoolifyApiClient — HTTP wrapper for every Coolify API endpoint.
 *
 * Stub — in PR #2 this class will expose one method per endpoint in
 * PRD §6 (applications, databases, services, deployments, servers,
 * projects, teams, security keys, resources, cloud-tokens, github-apps,
 * hetzner). For now only `version()` and `health()` are implemented so
 * the rest of the scaffold has something to compile against.
 */

import type { CoolifyClientOptions, CoolifyErrorShape } from "./types.js";

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
}

export class CoolifyApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CoolifyClientOptions) {
    if (!opts.baseUrl) throw new Error("baseUrl is required");
    if (!opts.token) throw new Error("token is required");
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.retries = opts.retries ?? 3;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  /** GET /api/health — returns "OK" string on healthy instances. */
  async health(): Promise<string> {
    const url = `${this.baseUrl}/api/health`;
    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new CoolifyApiError({
        status: res.status,
        endpoint: "/api/health",
        method: "GET",
      });
    }
    return (await res.text()).trim();
  }

  /** GET /api/v1/version — returns Coolify version string. */
  async version(): Promise<string> {
    return this.request<string>("GET", "/version");
  }

  /** GET /api/v1/enable — idempotent. */
  async enableApi(): Promise<unknown> {
    return this.request<unknown>("GET", "/enable");
  }

  /**
   * Internal request helper. Handles auth, timeout, retry on 5xx.
   * Full retry/backoff and API-disabled auto-recovery land in PR #2.
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        let errBody: unknown;
        try {
          errBody = await res.json();
        } catch {
          errBody = await res.text().catch(() => undefined);
        }
        throw new CoolifyApiError({
          status: res.status,
          endpoint: path,
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

  /** Exposes retry count for future wiring in PR #2. */
  get maxRetries(): number {
    return this.retries;
  }
}
