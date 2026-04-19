import { describe, expect, it, vi } from "vitest";
import { CoolifyApiClient, CoolifyApiError } from "../../src/core/api-client.js";

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

type ResponseDef = { status: number; body?: unknown; contentType?: string } | Error;

function sequencedFetch(sequence: ResponseDef[]): typeof fetch {
  const queue = [...sequence];
  return vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("sequencedFetch: no more responses");
    if (next instanceof Error) throw next;
    const body = next.body;
    const ct = next.contentType ?? (typeof body === "string" ? "text/plain" : "application/json");
    const headers = new Headers({ "content-type": ct });
    const payload = typeof body === "string" ? body : JSON.stringify(body ?? null);
    return new Response(payload, { status: next.status, headers });
  }) as unknown as typeof fetch;
}

function singleFetch(body: unknown, init: ResponseInit = { status: 200 }): typeof fetch {
  return sequencedFetch([
    {
      status: init.status ?? 200,
      body,
      contentType: (init.headers as Record<string, string>)?.["content-type"],
    },
  ]);
}

const noSleep = async (): Promise<void> => undefined;

function makeClient(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return new CoolifyApiClient({
    baseUrl: "https://example.com",
    token: "t",
    fetch: fetchImpl,
    sleep: noSleep,
    retryBaseMs: 1,
    ...overrides,
  });
}

// ----------------------------------------------------------------
// Construction
// ----------------------------------------------------------------

describe("CoolifyApiClient — construction", () => {
  it("requires baseUrl and token", () => {
    expect(() => new CoolifyApiClient({ baseUrl: "", token: "x" })).toThrow(/baseUrl/);
    expect(() => new CoolifyApiClient({ baseUrl: "https://x", token: "" })).toThrow(/token/);
  });

  it("trims trailing slash from baseUrl", async () => {
    const fetchImpl = singleFetch("OK");
    const client = new CoolifyApiClient({
      baseUrl: "https://example.com/",
      token: "t",
      fetch: fetchImpl,
      sleep: noSleep,
    });
    await client.health();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(
      "https://example.com/api/health",
    );
  });
});

// ----------------------------------------------------------------
// Basic request flow
// ----------------------------------------------------------------

describe("CoolifyApiClient — basic requests", () => {
  it("health() returns body text", async () => {
    const client = makeClient(singleFetch("OK"));
    expect(await client.health()).toBe("OK");
  });

  it("throws CoolifyApiError on non-2xx", async () => {
    const client = makeClient(sequencedFetch([{ status: 401, body: { error: "nope" } }]));
    await expect(client.version()).rejects.toBeInstanceOf(CoolifyApiError);
  });

  it("sends bearer token header", async () => {
    const fetchImpl = singleFetch("v4.0.0-beta.400");
    const client = makeClient(fetchImpl);
    await client.version();
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
      | RequestInit
      | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer t");
  });

  it("serializes JSON body on POST", async () => {
    const fetchImpl = singleFetch({ uuid: "abc" });
    const client = makeClient(fetchImpl);
    await client.project.create({ name: "demo" });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
      | RequestInit
      | undefined;
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ name: "demo" }));
  });
});

// ----------------------------------------------------------------
// Retry logic
// ----------------------------------------------------------------

describe("CoolifyApiClient — retry/backoff", () => {
  it("retries on 5xx then succeeds", async () => {
    const fetchImpl = sequencedFetch([
      { status: 500, body: "boom" },
      { status: 502, body: "boom" },
      { status: 200, body: "OK" },
    ]);
    const client = makeClient(fetchImpl);
    await expect(client.version()).resolves.toBe("OK");
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
  });

  it("does not retry on 4xx (other than 408/429)", async () => {
    const fetchImpl = sequencedFetch([{ status: 404, body: { error: "not found" } }]);
    const client = makeClient(fetchImpl);
    await expect(client.version()).rejects.toBeInstanceOf(CoolifyApiError);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("retries on 429", async () => {
    const fetchImpl = sequencedFetch([
      { status: 429, body: "rate-limited" },
      { status: 200, body: "OK" },
    ]);
    const client = makeClient(fetchImpl);
    await expect(client.version()).resolves.toBe("OK");
  });

  it("gives up after max retries", async () => {
    const fetchImpl = sequencedFetch([
      { status: 500, body: "boom" },
      { status: 500, body: "boom" },
      { status: 500, body: "boom" },
      { status: 500, body: "boom" },
    ]);
    const client = makeClient(fetchImpl, { retries: 2 });
    await expect(client.version()).rejects.toBeInstanceOf(CoolifyApiError);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
  });
});

// ----------------------------------------------------------------
// Auto-enable on "API disabled" error
// ----------------------------------------------------------------

describe("CoolifyApiClient — auto-enable", () => {
  it("calls /enable once on API-disabled error, then retries request", async () => {
    const fetchImpl = sequencedFetch([
      { status: 403, body: { message: "You are not allowed to access the API" } },
      { status: 200, body: "enabled" }, // /enable call
      { status: 200, body: [] }, // retry of original request
    ]);
    const client = makeClient(fetchImpl);
    await expect(client.apps.list()).resolves.toEqual([]);

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(3);
    expect(String(calls[0]?.[0])).toContain("/applications");
    expect(String(calls[1]?.[0])).toContain("/enable");
    expect(String(calls[2]?.[0])).toContain("/applications");
  });

  it("does not loop — only one auto-enable attempt per client", async () => {
    const fetchImpl = sequencedFetch([
      { status: 403, body: { message: "You are not allowed to access the API" } },
      { status: 200, body: "enabled" },
      { status: 403, body: { message: "You are not allowed to access the API" } },
      { status: 403, body: { message: "You are not allowed to access the API" } },
    ]);
    const client = makeClient(fetchImpl);
    await expect(client.apps.list()).rejects.toBeInstanceOf(CoolifyApiError);
  });

  it("does not attempt auto-enable for non-disabled 403s", async () => {
    const fetchImpl = sequencedFetch([{ status: 403, body: { message: "Forbidden" } }]);
    const client = makeClient(fetchImpl);
    await expect(client.apps.list()).rejects.toBeInstanceOf(CoolifyApiError);
  });
});

// ----------------------------------------------------------------
// Namespaces — URL shape smoke tests
// ----------------------------------------------------------------

describe("CoolifyApiClient — namespace URL shapes", () => {
  it("apps.get → GET /api/v1/applications/{uuid}", async () => {
    const fetchImpl = singleFetch({ uuid: "x" });
    const client = makeClient(fetchImpl);
    await client.apps.get("abc");
    expect(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toBe(
      "https://example.com/api/v1/applications/abc",
    );
  });

  it("db.createPostgres → POST /api/v1/databases/postgresql", async () => {
    const fetchImpl = singleFetch({ uuid: "db-1" });
    const client = makeClient(fetchImpl);
    await client.db.createPostgres({ server_uuid: "s", project_uuid: "p" });
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(call?.[0])).toBe("https://example.com/api/v1/databases/postgresql");
    expect((call?.[1] as RequestInit).method).toBe("POST");
  });

  it("deploy.trigger with query params", async () => {
    const fetchImpl = singleFetch({ ok: true });
    const client = makeClient(fetchImpl);
    await client.deploy.trigger({ uuid: "app-1", force: true });
    const url = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(url).toContain("/api/v1/deploy?");
    expect(url).toContain("uuid=app-1");
    expect(url).toContain("force=true");
  });

  it("apps.list with filters", async () => {
    const fetchImpl = singleFetch([]);
    const client = makeClient(fetchImpl);
    await client.apps.list({ server_uuid: "s1" });
    const url = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(url).toContain("/applications?server_uuid=s1");
  });

  it("team.current → GET /api/v1/teams/current", async () => {
    const fetchImpl = singleFetch({ id: 1 });
    const client = makeClient(fetchImpl);
    await client.team.current();
    expect(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toBe(
      "https://example.com/api/v1/teams/current",
    );
  });
});

// ----------------------------------------------------------------
// CoolifyApiError.isApiDisabled
// ----------------------------------------------------------------

describe("CoolifyApiError.isApiDisabled", () => {
  it("recognizes the disabled-API message", () => {
    const err = new CoolifyApiError({
      status: 403,
      endpoint: "/applications",
      method: "GET",
      body: { message: "You are not allowed to access the API" },
    });
    expect(err.isApiDisabled()).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    const err = new CoolifyApiError({
      status: 403,
      endpoint: "/applications",
      method: "GET",
      body: { message: "Forbidden" },
    });
    expect(err.isApiDisabled()).toBe(false);
  });

  it("only fires on 401/403", () => {
    const err = new CoolifyApiError({
      status: 500,
      endpoint: "/applications",
      method: "GET",
      body: { message: "You are not allowed to access the API" },
    });
    expect(err.isApiDisabled()).toBe(false);
  });
});
