import { describe, expect, it, vi } from "vitest";
import type { CoolifyApiClient } from "../../src/core/api-client.js";
import {
  getApplication,
  getDatabase,
  getServer,
  listApplications,
  listDatabases,
} from "../../src/core/compact.js";

const rawApp = {
  uuid: "a-1",
  name: "api-11d",
  status: "running",
  fqdn: "api.example.com",
  git_repository: "r",
  git_branch: "main",
  build_pack: "nixpacks",
  created_at: "2026-01-01",
  updated_at: "2026-04-18",
  dockerfile: "x".repeat(40000),
  server: { name: "prod" },
  password: "hunter2",
};

const rawDb = {
  uuid: "d-1",
  name: "pg-11d",
  status: "running",
  type: "postgresql",
  password: "secret",
  created_at: "2026-01-01",
  updated_at: "2026-04-18",
};

const rawServer = {
  uuid: "s-1",
  name: "edge-11d",
  ip: "1.2.3.4",
  port: 22,
  user: "root",
  is_reachable: true,
};

function mockClient() {
  return {
    apps: {
      list: vi.fn(async () => [rawApp]),
      get: vi.fn(async () => rawApp),
    },
    db: {
      list: vi.fn(async () => [rawDb]),
      get: vi.fn(async () => rawDb),
    },
    server: {
      get: vi.fn(async () => rawServer),
    },
  } as unknown as CoolifyApiClient;
}

describe("compact helpers", () => {
  it("listApplications returns compact shape by default", async () => {
    const result = (await listApplications(mockClient())) as Record<string, unknown>[];
    expect(result[0]?.uuid).toBe("a-1");
    expect(result[0]?.dockerfile).toBeUndefined();
    expect(result[0]?.server_name).toBe("prod");
  });

  it("getApplication redacts sensitive fields in compact mode", async () => {
    const result = (await getApplication(mockClient(), "a-1")) as Record<string, unknown>;
    // compact doesn't even carry 'password' key
    expect(result.password).toBeUndefined();
    expect(result.name).toBe("api-11d");
  });

  it("getApplication full + * scope reveals sensitive", async () => {
    const result = (await getApplication(mockClient(), "a-1", {
      verbosity: "full",
      scope: "*",
    })) as Record<string, unknown>;
    expect(result.password).toBe("hunter2");
  });

  it("listDatabases redacts password in non-full modes", async () => {
    const result = (await listDatabases(mockClient())) as Record<string, unknown>[];
    expect(result[0]?.password).toBeUndefined();
  });

  it("getDatabase standard verbosity keeps non-heavy fields but still redacts sensitive", async () => {
    const result = (await getDatabase(mockClient(), "d-1", {
      verbosity: "standard",
      scope: "read-only",
    })) as Record<string, unknown>;
    expect(result.type).toBe("postgresql");
    expect(result.password).toBe("***");
  });

  it("getServer compact returns flat fields", async () => {
    const result = (await getServer(mockClient(), "s-1")) as Record<string, unknown>;
    expect(result.ip).toBe("1.2.3.4");
    expect(result.is_reachable).toBe(true);
  });
});
