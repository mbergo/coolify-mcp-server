import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../../src/core/config.js";

const originalEnv = { ...process.env };

function unsetEnv(key: string): void {
  // Using Reflect.deleteProperty bypasses biome's noDelete while still being
  // the only way to truly unset a process.env key (assignment coerces to "undefined").
  Reflect.deleteProperty(process.env, key);
}

beforeEach(() => {
  unsetEnv("COOLIFY_BASE_URL");
  unsetEnv("COOLIFY_TOKEN");
  unsetEnv("COOLIFY_NAMING_SUFFIX");
  unsetEnv("COOLIFY_NAMING_COLLISION");
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("resolveConfig", () => {
  it("throws when base URL missing", () => {
    expect(() => resolveConfig()).toThrow(/base URL/i);
  });

  it("throws when token missing", () => {
    process.env.COOLIFY_BASE_URL = "https://example.com";
    expect(() => resolveConfig()).toThrow(/token/i);
  });

  it("env wins over file", () => {
    process.env.COOLIFY_BASE_URL = "https://env.example.com";
    process.env.COOLIFY_TOKEN = "env-token";
    const cfg = resolveConfig({ base_url: "https://file.example.com", token: "file-token" });
    expect(cfg.baseUrl).toBe("https://env.example.com");
    expect(cfg.token).toBe("env-token");
  });

  it("defaults naming policy to increment", () => {
    process.env.COOLIFY_BASE_URL = "https://x";
    process.env.COOLIFY_TOKEN = "t";
    const cfg = resolveConfig();
    expect(cfg.namingCollision).toBe("increment");
    expect(cfg.namingSuffix).toBe("11d");
  });
});
