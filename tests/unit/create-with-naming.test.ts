import { describe, expect, it, vi } from "vitest";
import type { CoolifyApiClient } from "../../src/core/api-client.js";
import {
  createDockerfileApp,
  createPostgres,
  createProject,
  createPublicApp,
  createRedis,
  createServer,
  createService,
} from "../../src/core/create-with-naming.js";

// ----------------------------------------------------------------
// Mock client factory
// ----------------------------------------------------------------

interface Scenario {
  existingApps?: { name?: string }[];
  existingDbs?: { name?: string }[];
  existingSvcs?: { name?: string }[];
  existingProjects?: { name?: string }[];
  existingServers?: { name?: string }[];
}

function mockClient(s: Scenario = {}) {
  const calls = {
    createPublic: vi.fn(async () => ({ uuid: "app-1" })),
    createDockerfile: vi.fn(async () => ({ uuid: "app-2" })),
    appsUpdate: vi.fn(async () => undefined),
    appsList: vi.fn(async () => s.existingApps ?? []),
    createPostgres: vi.fn(async () => ({ uuid: "db-1" })),
    createRedis: vi.fn(async () => ({ uuid: "db-2" })),
    dbUpdate: vi.fn(async () => undefined),
    dbList: vi.fn(async () => s.existingDbs ?? []),
    svcCreate: vi.fn(async () => ({ uuid: "svc-1" })),
    svcUpdate: vi.fn(async () => undefined),
    svcList: vi.fn(async () => s.existingSvcs ?? []),
    projectCreate: vi.fn(async () => ({ uuid: "proj-1" })),
    projectUpdate: vi.fn(async () => undefined),
    projectList: vi.fn(async () => s.existingProjects ?? []),
    serverCreate: vi.fn(async () => ({ uuid: "srv-1" })),
    serverUpdate: vi.fn(async () => undefined),
    serverList: vi.fn(async () => s.existingServers ?? []),
  };

  const client = {
    apps: {
      createPublic: calls.createPublic,
      createDockerfile: calls.createDockerfile,
      update: calls.appsUpdate,
      list: calls.appsList,
    },
    db: {
      createPostgres: calls.createPostgres,
      createRedis: calls.createRedis,
      update: calls.dbUpdate,
      list: calls.dbList,
    },
    svc: {
      create: calls.svcCreate,
      update: calls.svcUpdate,
      list: calls.svcList,
    },
    project: {
      create: calls.projectCreate,
      update: calls.projectUpdate,
      list: calls.projectList,
    },
    server: {
      create: calls.serverCreate,
      update: calls.serverUpdate,
      list: calls.serverList,
    },
  } as unknown as CoolifyApiClient;

  return { client, calls };
}

// ----------------------------------------------------------------
// Applications
// ----------------------------------------------------------------

describe("create-with-naming — applications", () => {
  it("createPublicApp: renames after create, no collision", async () => {
    const { client, calls } = mockClient();
    const result = await createPublicApp(
      client,
      {
        project_uuid: "p",
        server_uuid: "s",
        git_repository: "r",
        git_branch: "main",
        build_pack: "nixpacks",
      },
      { name: "api-gateway", fallbackBase: "api-gateway" },
    );

    expect(calls.createPublic).toHaveBeenCalledTimes(1);
    expect(calls.appsUpdate).toHaveBeenCalledWith("app-1", { name: "api-gateway-11d" });
    expect(result.finalName).toBe("api-gateway-11d");
    expect(result.collided).toBe(false);
  });

  it("createDockerfileApp: auto-increments on collision", async () => {
    const { client, calls } = mockClient({
      existingApps: [{ name: "api-11d" }, { name: "api-11d-01" }],
    });
    const result = await createDockerfileApp(
      client,
      {
        project_uuid: "p",
        server_uuid: "s",
        dockerfile: "FROM alpine",
      },
      { name: "api", fallbackBase: "api" },
    );
    expect(result.finalName).toBe("api-11d-02");
    expect(result.collided).toBe(true);
    expect(calls.appsUpdate).toHaveBeenCalledWith("app-2", { name: "api-11d-02" });
  });

  it("uses fallbackBase when desiredName absent", async () => {
    const { client, calls } = mockClient();
    await createPublicApp(
      client,
      {
        project_uuid: "p",
        server_uuid: "s",
        git_repository: "r",
        git_branch: "main",
        build_pack: "dockerfile",
      },
      { fallbackBase: "my-service" },
    );
    expect(calls.appsUpdate).toHaveBeenCalledWith("app-1", { name: "my-service-11d" });
  });
});

// ----------------------------------------------------------------
// Databases
// ----------------------------------------------------------------

describe("create-with-naming — databases", () => {
  it("createPostgres renames", async () => {
    const { client, calls } = mockClient();
    const result = await createPostgres(
      client,
      { server_uuid: "s", project_uuid: "p" },
      { name: "pg-main", fallbackBase: "pg-main" },
    );
    expect(calls.createPostgres).toHaveBeenCalledTimes(1);
    expect(calls.dbUpdate).toHaveBeenCalledWith("db-1", { name: "pg-main-11d" });
    expect(result.finalName).toBe("pg-main-11d");
  });

  it("createRedis collision → increment", async () => {
    const { client } = mockClient({
      existingDbs: [{ name: "cache-11d" }, { name: "cache-11d-01" }, { name: "cache-11d-02" }],
    });
    const result = await createRedis(
      client,
      { server_uuid: "s", project_uuid: "p" },
      { name: "cache", fallbackBase: "cache" },
    );
    expect(result.finalName).toBe("cache-11d-03");
  });
});

// ----------------------------------------------------------------
// Services / projects / servers
// ----------------------------------------------------------------

describe("create-with-naming — service / project / server", () => {
  it("createService renames", async () => {
    const { client, calls } = mockClient();
    const result = await createService(
      client,
      { server_uuid: "s", project_uuid: "p", type: "plausible" },
      { name: "analytics", fallbackBase: "analytics" },
    );
    expect(calls.svcUpdate).toHaveBeenCalledWith("svc-1", { name: "analytics-11d" });
    expect(result.finalName).toBe("analytics-11d");
  });

  it("createProject uses input.name as base", async () => {
    const { client, calls } = mockClient();
    const result = await createProject(client, { name: "my-project" });
    expect(calls.projectUpdate).toHaveBeenCalledWith("proj-1", { name: "my-project-11d" });
    expect(result.finalName).toBe("my-project-11d");
  });

  it("createServer uses input.name as base", async () => {
    const { client, calls } = mockClient();
    const result = await createServer(client, {
      name: "edge-node",
      ip: "1.2.3.4",
      private_key_uuid: "k",
    });
    expect(calls.serverUpdate).toHaveBeenCalledWith("srv-1", { name: "edge-node-11d" });
    expect(result.finalName).toBe("edge-node-11d");
  });
});

// ----------------------------------------------------------------
// Policy passthrough
// ----------------------------------------------------------------

describe("create-with-naming — policy", () => {
  it("policy=error throws on collision", async () => {
    const { client } = mockClient({ existingApps: [{ name: "api-11d" }] });
    await expect(
      createDockerfileApp(
        client,
        { project_uuid: "p", server_uuid: "s", dockerfile: "x" },
        { name: "api", fallbackBase: "api", policy: "error" },
      ),
    ).rejects.toThrow(/collision/i);
  });

  it("default policy is increment", async () => {
    const { client } = mockClient({ existingApps: [{ name: "api-11d" }] });
    const result = await createDockerfileApp(
      client,
      { project_uuid: "p", server_uuid: "s", dockerfile: "x" },
      { name: "api", fallbackBase: "api" },
    );
    expect(result.finalName).toBe("api-11d-01");
  });
});
