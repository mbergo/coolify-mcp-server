import { describe, expect, it, vi } from "vitest";
import {
  NAMING_CONSTANTS,
  applyElevenDSuffix,
  createWithNaming,
  hasElevenDSuffix,
  isSupabaseShaName,
  isValidElevenDName,
  normalizeBase,
  renameOnCreate,
  resolveName,
  stripElevenDSuffix,
  stripSupabaseSha,
} from "../../src/core/naming.js";

// ---- Predicates ----

describe("naming — predicates", () => {
  it("detects supabase SHA names", () => {
    expect(isSupabaseShaName("supabase-a3f7b2c1d4e5")).toBe(true);
    expect(isSupabaseShaName("supabase-DEADBEEF")).toBe(true);
    expect(isSupabaseShaName("supabase-xyz")).toBe(false); // non-hex
    expect(isSupabaseShaName("api-gateway-11d")).toBe(false);
  });

  it("hasElevenDSuffix handles single + multi-instance", () => {
    expect(hasElevenDSuffix("api-11d")).toBe(true);
    expect(hasElevenDSuffix("api-11d-01")).toBe(true);
    expect(hasElevenDSuffix("api-11d-40")).toBe(true);
    expect(hasElevenDSuffix("api-11d-0")).toBe(false); // single digit
    expect(hasElevenDSuffix("api")).toBe(false);
  });

  it("hasElevenDSuffix respects custom suffix", () => {
    expect(hasElevenDSuffix("api-prod", "prod")).toBe(true);
    expect(hasElevenDSuffix("api-prod", "11d")).toBe(false);
  });

  it("isValidElevenDName applies full charset + reserved + suffix checks", () => {
    expect(isValidElevenDName("api-gateway-11d")).toBe(true);
    expect(isValidElevenDName("Api-Gateway-11d")).toBe(false); // uppercase
    expect(isValidElevenDName("-foo-11d")).toBe(false); // leading dash
    expect(isValidElevenDName("foo-11d-")).toBe(false); // trailing dash
    expect(isValidElevenDName("coolify")).toBe(false); // reserved
    expect(isValidElevenDName("supabase-a3f7b2c1")).toBe(false);
  });

  it("stripElevenDSuffix removes suffix cleanly", () => {
    expect(stripElevenDSuffix("api-gateway-11d")).toBe("api-gateway");
    expect(stripElevenDSuffix("redis-11d-01")).toBe("redis");
    expect(stripElevenDSuffix("no-suffix")).toBe("no-suffix");
  });

  it("stripSupabaseSha only returns empty on match", () => {
    expect(stripSupabaseSha("supabase-a3f7b2c1")).toBe("");
    expect(stripSupabaseSha("api-gateway")).toBe(null);
  });
});

// ---- apply / normalize ----

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
    expect(() => applyElevenDSuffix("   ")).toThrow();
  });

  it("sanitizes base chars", () => {
    expect(applyElevenDSuffix("My Cool App!")).toBe("my-cool-app-11d");
    expect(applyElevenDSuffix("weird__name")).toBe("weird-name-11d");
  });

  it("custom suffix", () => {
    expect(applyElevenDSuffix("svc", { suffix: "prod" })).toBe("svc-prod");
  });
});

describe("naming — normalizeBase", () => {
  it("strips supabase SHA and uses fallback", () => {
    expect(normalizeBase("supabase-a3f7b2c1", "my-app")).toBe("my-app");
  });

  it("strips existing -11d suffix", () => {
    expect(normalizeBase("my-app-11d", "fallback")).toBe("my-app");
    expect(normalizeBase("my-app-11d-03", "fallback")).toBe("my-app");
  });

  it("sanitizes unsafe chars", () => {
    expect(normalizeBase("My App!", "fallback")).toBe("my-app");
  });

  it("throws if both name + fallback are unusable", () => {
    expect(() => normalizeBase(undefined, "")).toThrow();
    expect(() => normalizeBase("supabase-abc123", "   ")).toThrow();
  });
});

// ---- Collision resolver ----

describe("naming — resolveName", () => {
  it("returns single-instance name when no collision", async () => {
    const result = await resolveName({
      base: "api",
      policy: "error",
      existing: () => [],
    });
    expect(result).toEqual({ name: "api-11d", collided: false });
  });

  it("policy=error throws on collision", async () => {
    await expect(
      resolveName({
        base: "api",
        policy: "error",
        existing: () => ["api-11d"],
      }),
    ).rejects.toThrow(/collision/i);
  });

  it("policy=increment walks 01..40", async () => {
    const result = await resolveName({
      base: "api",
      policy: "increment",
      existing: () => ["api-11d", "api-11d-01", "api-11d-02"],
    });
    expect(result).toEqual({ name: "api-11d-03", collided: true, index: 3 });
  });

  it("policy=increment throws when all 40 exhausted", async () => {
    const taken = [
      "api-11d",
      ...Array.from({ length: 40 }, (_, i) => `api-11d-${String(i + 1).padStart(2, "0")}`),
    ];
    await expect(
      resolveName({ base: "api", policy: "increment", existing: () => taken }),
    ).rejects.toThrow(/exhausted/i);
  });

  it("policy=prompt calls callback with first free suggestion", async () => {
    const prompt = vi.fn(async (s: string) => s);
    const result = await resolveName({
      base: "api",
      policy: "prompt",
      existing: () => ["api-11d"],
      prompt,
    });
    expect(prompt).toHaveBeenCalledWith("api-11d-01");
    expect(result.name).toBe("api-11d-01");
    expect(result.collided).toBe(true);
  });

  it("policy=prompt throws when no callback wired", async () => {
    await expect(
      resolveName({
        base: "api",
        policy: "prompt",
        existing: () => ["api-11d"],
      }),
    ).rejects.toThrow(/no prompt handler/i);
  });

  it("policy=prompt rejects empty or colliding chosen name", async () => {
    await expect(
      resolveName({
        base: "api",
        policy: "prompt",
        existing: () => ["api-11d"],
        prompt: async () => "",
      }),
    ).rejects.toThrow(/empty/i);

    await expect(
      resolveName({
        base: "api",
        policy: "prompt",
        existing: () => ["api-11d", "api-11d-01"],
        prompt: async () => "api-11d-01",
      }),
    ).rejects.toThrow(/collides/i);
  });
});

// ---- Rename hook + create orchestrator ----

describe("naming — renameOnCreate", () => {
  it("calls patchName with resolved name", async () => {
    const patchName = vi.fn(async () => ({ ok: true }));
    const result = await renameOnCreate({
      uuid: "xyz",
      desiredName: "api-gateway",
      fallbackBase: "fallback",
      policy: "increment",
      existing: () => [],
      patchName,
    });
    expect(patchName).toHaveBeenCalledWith("xyz", "api-gateway-11d");
    expect(result.finalName).toBe("api-gateway-11d");
    expect(result.collided).toBe(false);
  });

  it("falls back to fallbackBase when desiredName is a supabase SHA", async () => {
    const patchName = vi.fn(async () => undefined);
    await renameOnCreate({
      uuid: "u",
      desiredName: "supabase-a3f7b2c1",
      fallbackBase: "redis-main",
      policy: "increment",
      existing: () => [],
      patchName,
    });
    expect(patchName).toHaveBeenCalledWith("u", "redis-main-11d");
  });

  it("auto-increments on collision", async () => {
    const patchName = vi.fn(async () => undefined);
    const result = await renameOnCreate({
      uuid: "u",
      desiredName: "redis",
      fallbackBase: "redis",
      policy: "increment",
      existing: () => ["redis-11d", "redis-11d-01"],
      patchName,
    });
    expect(result.finalName).toBe("redis-11d-02");
    expect(result.collided).toBe(true);
  });
});

describe("naming — createWithNaming orchestrator", () => {
  it("runs create → rename PATCH in order", async () => {
    const order: string[] = [];
    const create = vi.fn(async () => {
      order.push("create");
      return { uuid: "new-uuid" };
    });
    const patchName = vi.fn(async () => {
      order.push("patch");
    });

    const result = await createWithNaming({
      create,
      input: { foo: "bar" },
      desiredName: "my-api",
      fallbackBase: "my-api",
      policy: "error",
      existing: () => [],
      patchName,
    });

    expect(order).toEqual(["create", "patch"]);
    expect(create).toHaveBeenCalledWith({ foo: "bar" });
    expect(patchName).toHaveBeenCalledWith("new-uuid", "my-api-11d");
    expect(result.finalName).toBe("my-api-11d");
    expect(result.create).toEqual({ uuid: "new-uuid" });
  });

  it("throws when create returns no uuid", async () => {
    await expect(
      createWithNaming({
        create: async () => ({}) as { uuid?: string },
        input: {},
        fallbackBase: "fallback",
        policy: "error",
        existing: () => [],
        patchName: async () => undefined,
      }),
    ).rejects.toThrow(/UUID/);
  });

  it("supports custom UUID extractor", async () => {
    const patchName = vi.fn(async () => undefined);
    await createWithNaming({
      create: async () => ({ data: { id: "abc" } }) as unknown as { uuid?: string },
      input: {},
      fallbackBase: "x",
      policy: "error",
      existing: () => [],
      patchName,
      extractUuid: (r) => (r as unknown as { data: { id: string } }).data.id,
    });
    expect(patchName).toHaveBeenCalledWith("abc", "x-11d");
  });
});

// ---- Constants sanity ----

describe("naming — NAMING_CONSTANTS", () => {
  it("exposes range + reserved list", () => {
    expect(NAMING_CONSTANTS.DEFAULT_SUFFIX).toBe("11d");
    expect(NAMING_CONSTANTS.MIN_INDEX).toBe(1);
    expect(NAMING_CONSTANTS.MAX_INDEX).toBe(40);
    expect(NAMING_CONSTANTS.RESERVED_NAMES).toContain("coolify");
  });
});
