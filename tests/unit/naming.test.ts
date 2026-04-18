import { describe, expect, it } from "vitest";
import {
  applyElevenDSuffix,
  hasElevenDSuffix,
  isSupabaseShaName,
  isValidElevenDName,
} from "../../src/core/naming.js";

describe("naming — supabase SHA detection", () => {
  it("detects Coolify auto-generated names", () => {
    expect(isSupabaseShaName("supabase-a3f7b2c1d4e5")).toBe(true);
    expect(isSupabaseShaName("supabase-DEADBEEF")).toBe(true);
  });

  it("ignores non-supabase names", () => {
    expect(isSupabaseShaName("api-gateway-11d")).toBe(false);
    expect(isSupabaseShaName("supabase")).toBe(false);
    expect(isSupabaseShaName("supabase-xyz")).toBe(false); // non-hex
  });
});

describe("naming — applyElevenDSuffix", () => {
  it("single-instance", () => {
    expect(applyElevenDSuffix("api-gateway")).toBe("api-gateway-11d");
  });

  it("multi-instance pads to 2 digits", () => {
    expect(applyElevenDSuffix("redis-cache", { multiInstance: true, index: 1 })).toBe(
      "redis-cache-11d-01",
    );
    expect(applyElevenDSuffix("redis-cache", { multiInstance: true, index: 40 })).toBe(
      "redis-cache-11d-40",
    );
  });

  it("rejects out-of-range index", () => {
    expect(() => applyElevenDSuffix("x", { multiInstance: true, index: 0 })).toThrow();
    expect(() => applyElevenDSuffix("x", { multiInstance: true, index: 41 })).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => applyElevenDSuffix("")).toThrow();
  });

  it("custom suffix", () => {
    expect(applyElevenDSuffix("svc", { suffix: "prod" })).toBe("svc-prod");
  });
});

describe("naming — validators", () => {
  it("hasElevenDSuffix", () => {
    expect(hasElevenDSuffix("api-11d")).toBe(true);
    expect(hasElevenDSuffix("api-11d-01")).toBe(true);
    expect(hasElevenDSuffix("api")).toBe(false);
  });

  it("isValidElevenDName", () => {
    expect(isValidElevenDName("api-gateway-11d")).toBe(true);
    expect(isValidElevenDName("supabase-a3f7b2c1")).toBe(false);
    expect(isValidElevenDName("api")).toBe(false);
  });
});
