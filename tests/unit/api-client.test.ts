import { describe, expect, it, vi } from "vitest";
import { CoolifyApiClient, CoolifyApiError } from "../../src/core/api-client.js";

function mockFetch(body: unknown, init: ResponseInit = { status: 200 }): typeof fetch {
  return vi.fn(async () => {
    const headers = new Headers(init.headers);
    if (!headers.has("content-type")) {
      headers.set("content-type", typeof body === "string" ? "text/plain" : "application/json");
    }
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      ...init,
      headers,
    });
  }) as unknown as typeof fetch;
}

describe("CoolifyApiClient", () => {
  it("requires baseUrl and token", () => {
    expect(() => new CoolifyApiClient({ baseUrl: "", token: "x" })).toThrow(/baseUrl/);
    expect(() => new CoolifyApiClient({ baseUrl: "https://x", token: "" })).toThrow(/token/);
  });

  it("trims trailing slash from baseUrl", async () => {
    const fetchImpl = mockFetch("OK");
    const client = new CoolifyApiClient({
      baseUrl: "https://example.com/",
      token: "t",
      fetch: fetchImpl,
    });
    await client.health();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(
      "https://example.com/api/health",
    );
  });

  it("health() returns body text", async () => {
    const client = new CoolifyApiClient({
      baseUrl: "https://example.com",
      token: "t",
      fetch: mockFetch("OK"),
    });
    expect(await client.health()).toBe("OK");
  });

  it("throws CoolifyApiError on non-2xx", async () => {
    const client = new CoolifyApiClient({
      baseUrl: "https://example.com",
      token: "t",
      fetch: mockFetch({ error: "nope" }, { status: 401 }),
    });
    await expect(client.version()).rejects.toBeInstanceOf(CoolifyApiError);
  });

  it("sends bearer token header", async () => {
    const fetchImpl = mockFetch("v4.0.0-beta.400");
    const client = new CoolifyApiClient({
      baseUrl: "https://example.com",
      token: "abc123",
      fetch: fetchImpl,
    });
    await client.version();
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
      | RequestInit
      | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer abc123");
  });
});
