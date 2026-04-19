import { describe, expect, it, vi } from "vitest";
import type { CoolifyApiClient } from "../../src/core/api-client.js";
import { _internals, searchResources } from "../../src/core/search.js";

// ----------------------------------------------------------------
// Fuzzy primitives
// ----------------------------------------------------------------

describe("search — fuzzy primitives", () => {
  it("levenshtein basics", () => {
    expect(_internals.levenshtein("kitten", "sitting")).toBe(3);
    expect(_internals.levenshtein("same", "same")).toBe(0);
    expect(_internals.levenshtein("", "abc")).toBe(3);
  });

  it("fuzzyScore gives 1.0 for exact match", () => {
    expect(_internals.fuzzyScore("api", "api")).toBe(1);
  });

  it("fuzzyScore gives higher score for substring", () => {
    const sub = _internals.fuzzyScore("api", "api-gateway");
    expect(sub).toBeGreaterThan(0.5);
  });

  it("fuzzyScore handles typos", () => {
    expect(_internals.fuzzyScore("redis", "redds")).toBeGreaterThan(0.4);
  });

  it("looksLikeIp / looksLikeUuid / looksLikeDomain", () => {
    expect(_internals.looksLikeIp("1.2.3.4")).toBe(true);
    expect(_internals.looksLikeIp("1.2.3")).toBe(false);
    expect(_internals.looksLikeUuid("abcd1234")).toBe(true);
    expect(_internals.looksLikeUuid("abcd-1234-5678-9012-abcdef123456")).toBe(false); // wrong length
    expect(_internals.looksLikeDomain("api.example.com")).toBe(true);
    expect(_internals.looksLikeDomain("just-a-name")).toBe(false);
  });
});

// ----------------------------------------------------------------
// Mock client for searchResources
// ----------------------------------------------------------------

function makeClient() {
  const apps = [
    {
      uuid: "app-uuid-1",
      name: "api-gateway-11d",
      status: "running",
      fqdn: "api.example.com",
    },
    { uuid: "app-uuid-2", name: "worker-11d", status: "running" },
  ];
  const dbs = [{ uuid: "db-uuid-1", name: "pg-main-11d", status: "running", type: "postgresql" }];
  const svcs = [
    { uuid: "svc-uuid-1", name: "analytics-11d", status: "running", service_type: "plausible" },
  ];
  const servers = [{ uuid: "srv-uuid-1", name: "edge-11d", ip: "203.0.113.7", is_reachable: true }];
  const projects = [{ uuid: "proj-uuid-1", name: "main-11d" }];

  return {
    apps: { list: vi.fn(async () => apps) },
    db: { list: vi.fn(async () => dbs) },
    svc: { list: vi.fn(async () => svcs) },
    server: { list: vi.fn(async () => servers) },
    project: { list: vi.fn(async () => projects) },
  } as unknown as CoolifyApiClient;
}

describe("searchResources", () => {
  it("returns empty array for empty query", async () => {
    const r = await searchResources(makeClient(), "   ");
    expect(r).toEqual([]);
  });

  it("finds app by exact name", async () => {
    const r = await searchResources(makeClient(), "api-gateway-11d");
    expect(r[0]).toMatchObject({
      kind: "application",
      name: "api-gateway-11d",
      matchedOn: "name",
      score: 1,
    });
  });

  it("finds app by fqdn", async () => {
    const r = await searchResources(makeClient(), "api.example.com");
    expect(r[0]?.kind).toBe("application");
    expect(r[0]?.matchedOn).toBe("fqdn");
  });

  it("finds server by IP", async () => {
    const r = await searchResources(makeClient(), "203.0.113.7");
    expect(r[0]?.kind).toBe("server");
    expect(r[0]?.matchedOn).toBe("ip");
  });

  it("fuzzy-matches app name when no exact hit", async () => {
    const r = await searchResources(makeClient(), "gateway", { exactFirst: false });
    expect(r.some((m) => m.kind === "application" && m.matchedOn === "fuzzy")).toBe(true);
  });

  it("respects kinds filter", async () => {
    const r = await searchResources(makeClient(), "main-11d", { kinds: ["project"] });
    expect(r).toHaveLength(1);
    expect(r[0]?.kind).toBe("project");
  });

  it("respects limit", async () => {
    const r = await searchResources(makeClient(), "11d", { limit: 2, exactFirst: false });
    expect(r.length).toBeLessThanOrEqual(2);
  });

  it("exactFirst short-circuits to exact matches", async () => {
    const r = await searchResources(makeClient(), "pg-main-11d");
    expect(r.every((m) => m.score === 1)).toBe(true);
  });
});
