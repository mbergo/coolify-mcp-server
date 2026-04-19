import { describe, expect, it } from "vitest";
import {
  COMPACT_MAX_BYTES,
  assertCompactSize,
  canRevealSensitive,
  jsonByteSize,
  optimizeEntity,
  optimizeList,
  redact,
  redactEnvVar,
  toApplicationCompact,
  toDatabaseCompact,
  toDeploymentCompact,
  toProjectCompact,
  toServerCompact,
  toServiceCompact,
  toStandard,
} from "../../src/core/optimizer.js";
import type { TokenScope, Verbosity } from "../../src/core/types.js";

// ----------------------------------------------------------------
// Fixtures — verbose raw payloads approximating Coolify's shape
// ----------------------------------------------------------------

const rawApp = {
  uuid: "app-uuid-1",
  name: "api-gateway-11d",
  status: "running",
  fqdn: "api.example.com",
  git_repository: "github.com/v3ct0r/api",
  git_branch: "main",
  build_pack: "nixpacks",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-04-18T00:00:00Z",
  ports_mappings: "3000:3000",
  server: { name: "prod-01", uuid: "srv-1", ip: "1.2.3.4" },
  project: { uuid: "proj-1", name: "main" },
  environment: { name: "production", project: { name: "main" } },
  dockerfile: "x".repeat(47 * 1024), // 47 KB heavy field
  docker_compose_raw: "services:\n  web:\n",
  manual_webhook_secret_github: "supersecret",
  health_check_status: "healthy",
  deployment_status: "deployed",
  password: "hunter2",
  api_key: "sk-abc123",
};

const rawDb = {
  uuid: "db-1",
  name: "pg-main-11d",
  status: "running",
  type: "postgresql",
  image: "postgres:16",
  public_port: 5432,
  is_public: false,
  server: { name: "prod-01" },
  project: { name: "main" },
  environment: { name: "production" },
  postgres_password: "very-secret",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-04-18T00:00:00Z",
};

// ----------------------------------------------------------------
// Compact transforms
// ----------------------------------------------------------------

describe("optimizer — compact transforms", () => {
  it("application: flattens server/project/environment", () => {
    const c = toApplicationCompact(rawApp);
    expect(c.uuid).toBe("app-uuid-1");
    expect(c.server_name).toBe("prod-01");
    expect(c.project_name).toBe("main");
    expect(c.environment).toBe("production");
    // Heavy fields should not appear
    expect(Object.keys(c)).not.toContain("dockerfile");
    expect(Object.keys(c)).not.toContain("docker_compose_raw");
  });

  it("database: flattens + retains engine type", () => {
    const c = toDatabaseCompact(rawDb);
    expect(c.type).toBe("postgresql");
    expect(c.server_name).toBe("prod-01");
    expect(Object.keys(c)).not.toContain("postgres_password");
  });

  it("service / deployment / server / project transforms run without throwing", () => {
    expect(toServiceCompact({ uuid: "s", name: "n" }).uuid).toBe("s");
    expect(toDeploymentCompact({ uuid: "d", application_uuid: "a" }).uuid).toBe("d");
    expect(toServerCompact({ uuid: "srv", name: "n", ip: "1.2.3.4" }).ip).toBe("1.2.3.4");
    expect(
      toProjectCompact({
        uuid: "p",
        name: "main",
        environments: [{ uuid: "e1", name: "prod" }],
      }).environments,
    ).toEqual([{ uuid: "e1", name: "prod" }]);
  });
});

// ----------------------------------------------------------------
// toStandard
// ----------------------------------------------------------------

describe("optimizer — toStandard", () => {
  it("drops heavy fields, keeps the rest", () => {
    const s = toStandard(rawApp) as Record<string, unknown>;
    expect(s.dockerfile).toBeUndefined();
    expect(s.docker_compose_raw).toBeUndefined();
    expect(s.manual_webhook_secret_github).toBeUndefined();
    expect(s.name).toBe("api-gateway-11d");
    expect(s.git_repository).toBe("github.com/v3ct0r/api");
  });
});

// ----------------------------------------------------------------
// Redaction
// ----------------------------------------------------------------

describe("optimizer — redact()", () => {
  const compactCtx = { verbosity: "compact" as Verbosity, scope: "*" as TokenScope };

  it("redacts sensitive keys in compact mode regardless of scope", () => {
    const r = redact(rawApp, compactCtx) as Record<string, unknown>;
    expect(r.password).toBe("***");
    expect(r.api_key).toBe("***");
  });

  it("reveals sensitive values only when verbosity=full AND scope allows", () => {
    const allowed = redact(rawApp, {
      verbosity: "full",
      scope: "*",
    }) as Record<string, unknown>;
    expect(allowed.password).toBe("hunter2");

    const denied = redact(rawApp, {
      verbosity: "full",
      scope: "read-only",
    }) as Record<string, unknown>;
    expect(denied.password).toBe("***");
  });

  it("walks nested objects + arrays", () => {
    const nested = {
      list: [{ token: "abc" }, { token: "def" }],
      deep: { inner: { api_key: "xyz" } },
    };
    const r = redact(nested, compactCtx) as Record<string, unknown>;
    expect((r.list as { token: string }[])[0].token).toBe("***");
    expect((r.deep as { inner: { api_key: string } }).inner.api_key).toBe("***");
  });

  it("canRevealSensitive guard", () => {
    expect(canRevealSensitive({ verbosity: "full", scope: "*" })).toBe(true);
    expect(canRevealSensitive({ verbosity: "full", scope: "read:sensitive" })).toBe(true);
    expect(canRevealSensitive({ verbosity: "full", scope: "read-only" })).toBe(false);
    expect(canRevealSensitive({ verbosity: "compact", scope: "*" })).toBe(false);
  });
});

describe("optimizer — redactEnvVar()", () => {
  it("keeps key visible, redacts value by default", () => {
    const e = redactEnvVar(
      { key: "DB_PASSWORD", value: "super" },
      { verbosity: "compact", scope: "*" },
    );
    expect(e.key).toBe("DB_PASSWORD");
    expect(e.value).toBe("***");
  });

  it("reveals when scope + full verbosity allow", () => {
    const e = redactEnvVar(
      { key: "DB_PASSWORD", value: "super" },
      { verbosity: "full", scope: "*" },
    );
    expect(e.value).toBe("super");
  });

  it("leaves empty values alone", () => {
    const e = redactEnvVar({ key: "FOO", value: "" }, { verbosity: "compact", scope: "*" });
    expect(e.value).toBe("");
  });
});

// ----------------------------------------------------------------
// optimizeEntity + optimizeList dispatcher
// ----------------------------------------------------------------

describe("optimizer — optimizeEntity dispatcher", () => {
  it("compact verbosity applies compact transform", () => {
    const c = optimizeEntity<Record<string, unknown>>(rawApp, {
      kind: "application",
      verbosity: "compact",
      scope: "*",
    });
    expect(c.dockerfile).toBeUndefined();
    expect(c.name).toBe("api-gateway-11d");
  });

  it("standard verbosity uses toStandard", () => {
    const s = optimizeEntity<Record<string, unknown>>(rawApp, {
      kind: "application",
      verbosity: "standard",
      scope: "*",
    });
    expect(s.dockerfile).toBeUndefined();
    expect(s.ports_mappings).toBe("3000:3000"); // retained
  });

  it("full verbosity + scope=* returns raw + unredacted", () => {
    const f = optimizeEntity<Record<string, unknown>>(rawApp, {
      kind: "application",
      verbosity: "full",
      scope: "*",
    });
    expect(f.dockerfile).toBeDefined();
    expect(f.password).toBe("hunter2");
  });

  it("full verbosity + scope=read-only still redacts", () => {
    const f = optimizeEntity<Record<string, unknown>>(rawApp, {
      kind: "application",
      verbosity: "full",
      scope: "read-only",
    });
    expect(f.password).toBe("***");
  });

  it("optimizeList maps over arrays", () => {
    const list = optimizeList([rawApp, rawApp], {
      kind: "application",
      verbosity: "compact",
      scope: "*",
    });
    expect(list).toHaveLength(2);
  });
});

// ----------------------------------------------------------------
// Size guard
// ----------------------------------------------------------------

describe("optimizer — size budget (<2KB compact)", () => {
  it("jsonByteSize counts UTF-8 bytes", () => {
    expect(jsonByteSize({ a: "x" })).toBe(JSON.stringify({ a: "x" }).length);
  });

  it("compact application stays under 2KB", () => {
    const c = optimizeEntity(rawApp, {
      kind: "application",
      verbosity: "compact",
      scope: "*",
    });
    expect(jsonByteSize(c)).toBeLessThan(COMPACT_MAX_BYTES);
    assertCompactSize(c, "application"); // should not throw
  });

  it("compact database stays under 2KB", () => {
    const c = optimizeEntity(rawDb, {
      kind: "database",
      verbosity: "compact",
      scope: "*",
    });
    expect(jsonByteSize(c)).toBeLessThan(COMPACT_MAX_BYTES);
    assertCompactSize(c, "database");
  });

  it("assertCompactSize throws when a compact entity blows the budget", () => {
    const oversized = { uuid: "x", name: "n", blob: "y".repeat(3000) };
    expect(() => assertCompactSize(oversized, "application")).toThrow(/budget/);
  });
});
