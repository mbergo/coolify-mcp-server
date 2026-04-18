import { describe, expect, it, vi } from "vitest";
import { CoolifyApiClient } from "../../src/core/api-client.js";
import { ensureApiEnabled, probeTokenScope } from "../../src/core/auth.js";

type Seq = { status: number; body?: unknown }[];

function seqFetch(seq: Seq): typeof fetch {
  const q = [...seq];
  return vi.fn(async () => {
    const n = q.shift();
    if (!n) throw new Error("exhausted");
    const ct = typeof n.body === "string" ? "text/plain" : "application/json";
    const payload = typeof n.body === "string" ? n.body : JSON.stringify(n.body ?? null);
    return new Response(payload, { status: n.status, headers: { "content-type": ct } });
  }) as unknown as typeof fetch;
}

function client(seq: Seq): CoolifyApiClient {
  return new CoolifyApiClient({
    baseUrl: "https://example.com",
    token: "t",
    fetch: seqFetch(seq),
    sleep: async () => undefined,
    retryBaseMs: 1,
    autoEnableApi: false,
  });
}

describe("probeTokenScope", () => {
  it("detects `*` scope when every probe passes", async () => {
    const c = client([
      { status: 200, body: { id: 1 } }, // /teams/current
      { status: 200, body: [] }, // /applications
      { status: 200, body: [] }, // /security/keys
    ]);
    const result = await probeTokenScope(c);
    expect(result.canRead).toBe(true);
    expect(result.canReadSensitive).toBe(true);
    expect(result.scope).toBe("*");
  });

  it("detects read-only when sensitive endpoint 403s", async () => {
    const c = client([
      { status: 200, body: { id: 1 } }, // /teams/current
      { status: 200, body: [] }, // /applications
      { status: 403, body: { message: "Forbidden" } }, // /security/keys
    ]);
    const result = await probeTokenScope(c);
    expect(result.scope).toBe("read-only");
    expect(result.canReadSensitive).toBe(false);
  });

  it("returns unknown when token is rejected outright", async () => {
    const c = client([{ status: 401, body: { message: "Unauthenticated" } }]);
    const result = await probeTokenScope(c);
    expect(result.scope).toBe("unknown");
  });

  it("flags API-disabled instances", async () => {
    const c = client([
      { status: 403, body: { message: "You are not allowed to access the API" } },
      // probe continues but apps will also fail
      { status: 403, body: { message: "You are not allowed to access the API" } },
      { status: 403, body: { message: "You are not allowed to access the API" } },
    ]);
    const result = await probeTokenScope(c);
    expect(result.apiEnabled).toBe(false);
    expect(result.notes.some((n) => n.includes("API appears disabled"))).toBe(true);
  });
});

describe("ensureApiEnabled", () => {
  it("no-ops on 400 (already enabled)", async () => {
    const c = client([{ status: 400, body: { message: "already enabled" } }]);
    await expect(ensureApiEnabled(c)).resolves.toBeUndefined();
  });

  it("succeeds on 200", async () => {
    const c = client([{ status: 200, body: { ok: true } }]);
    await expect(ensureApiEnabled(c)).resolves.toBeUndefined();
  });

  it("rethrows on 500", async () => {
    const c = client([{ status: 500, body: "boom" }]);
    await expect(ensureApiEnabled(c)).rejects.toThrow();
  });
});
