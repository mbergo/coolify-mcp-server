import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearConfig,
  getConfigValue,
  resetStoreForTests,
  resolveConfig,
  setConfigValue,
} from "../../src/core/config.js";

function unsetEnv(key: string): void {
  Reflect.deleteProperty(process.env, key);
}

const originalEnv = { ...process.env };

beforeEach(() => {
  unsetEnv("COOLIFY_BASE_URL");
  unsetEnv("COOLIFY_TOKEN");
  unsetEnv("COOLIFY_NAMING_SUFFIX");
  unsetEnv("COOLIFY_NAMING_COLLISION");
  resetStoreForTests();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("resolveConfig — env overlay", () => {
  it("throws when base URL missing", () => {
    expect(() => resolveConfig({})).toThrow(/base URL/i);
  });

  it("throws when token missing", () => {
    process.env.COOLIFY_BASE_URL = "https://example.com";
    expect(() => resolveConfig({})).toThrow(/token/i);
  });

  it("env wins over file override", () => {
    process.env.COOLIFY_BASE_URL = "https://env.example.com";
    process.env.COOLIFY_TOKEN = "env-token";
    const cfg = resolveConfig({
      base_url: "https://file.example.com",
      token: "file-token",
    });
    expect(cfg.baseUrl).toBe("https://env.example.com");
    expect(cfg.token).toBe("env-token");
  });

  it("applies defaults for optional fields", () => {
    const cfg = resolveConfig({ base_url: "https://x", token: "t" });
    expect(cfg.namingCollision).toBe("increment");
    expect(cfg.namingSuffix).toBe("11d");
    expect(cfg.outputFormat).toBe("table");
    expect(cfg.verbosity).toBe("standard");
  });

  it("env COOLIFY_NAMING_COLLISION overrides file", () => {
    process.env.COOLIFY_NAMING_COLLISION = "error";
    const cfg = resolveConfig({
      base_url: "https://x",
      token: "t",
      naming_collision: "increment",
    });
    expect(cfg.namingCollision).toBe("error");
  });

  it("falls back to default if env value is invalid", () => {
    process.env.COOLIFY_NAMING_COLLISION = "nonsense";
    const cfg = resolveConfig({ base_url: "https://x", token: "t" });
    expect(cfg.namingCollision).toBe("increment");
  });
});

describe("persistent store", () => {
  afterEach(() => {
    try {
      clearConfig();
    } catch {
      // ignore — store may not be writable in CI sandbox
    }
    resetStoreForTests();
  });

  it("set / get roundtrip", () => {
    setConfigValue("base_url", "https://persisted.example.com");
    setConfigValue("token", "persisted-token");
    expect(getConfigValue("base_url")).toBe("https://persisted.example.com");
    expect(getConfigValue("token")).toBe("persisted-token");
  });

  it("persisted config resolves when env absent", () => {
    setConfigValue("base_url", "https://p.example.com");
    setConfigValue("token", "pt");
    const cfg = resolveConfig();
    expect(cfg.baseUrl).toBe("https://p.example.com");
    expect(cfg.token).toBe("pt");
  });

  it("clearConfig wipes state", () => {
    setConfigValue("token", "pt");
    clearConfig();
    expect(getConfigValue("token")).toBeUndefined();
  });
});
