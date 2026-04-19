/**
 * 11d naming convention engine (PRD §4).
 *
 * Rules:
 *   <descriptive-name>-11d          # single instance
 *   <descriptive-name>-11d-NN       # multi-instance (NN = 01..40)
 *
 * Coolify auto-generates `supabase-<sha>` names. This module:
 *   1. Detects + strips that pattern
 *   2. Applies the -11d (or -11d-NN) suffix
 *   3. Resolves collisions via a configurable policy
 *   4. Exposes renameOnCreate() — the post-create PATCH hook used by
 *      api-client's create wrappers
 */

import type { NamingCollisionPolicy } from "./types.js";

// ----------------------------------------------------------------
// Constants / regex
// ----------------------------------------------------------------

const SUPABASE_SHA_RE = /^supabase-[a-f0-9]{6,}$/i;
const DEFAULT_SUFFIX = "11d";
const MIN_INDEX = 1;
const MAX_INDEX = 40;

/**
 * Kubernetes-ish safe name charset: lowercase alnum + dashes, no leading/
 * trailing dash, 3-63 chars. Matches Coolify's own validator loosely.
 */
const SAFE_NAME_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

// Reserved names Coolify / Docker refuses. Keep small + strict.
const RESERVED_NAMES = new Set<string>([
  "coolify",
  "docker",
  "localhost",
  "admin",
  "root",
  "system",
]);

// ----------------------------------------------------------------
// Pure predicates
// ----------------------------------------------------------------

export interface ApplyOptions {
  /** Custom suffix. Default: "11d". */
  suffix?: string;
  /** Append `-NN` index (01..40). */
  multiInstance?: boolean;
  /** Multi-instance index. Required when multiInstance=true. */
  index?: number;
}

/** Detect Coolify's auto-generated `supabase-<sha>` pattern. */
export function isSupabaseShaName(name: string): boolean {
  return SUPABASE_SHA_RE.test(name);
}

/** Returns true when `name` already carries the -{suffix} or -{suffix}-NN tail. */
export function hasElevenDSuffix(name: string, suffix = DEFAULT_SUFFIX): boolean {
  return new RegExp(`-${escapeRegex(suffix)}(?:-\\d{2})?$`).test(name);
}

/** Safe charset + reserved check + 11d suffix check. */
export function isValidElevenDName(name: string, suffix = DEFAULT_SUFFIX): boolean {
  if (!SAFE_NAME_RE.test(name)) return false;
  if (RESERVED_NAMES.has(name)) return false;
  if (isSupabaseShaName(name)) return false;
  return hasElevenDSuffix(name, suffix);
}

/** Extract the descriptive base from a -11d[-NN] name. */
export function stripElevenDSuffix(name: string, suffix = DEFAULT_SUFFIX): string {
  return name.replace(new RegExp(`-${escapeRegex(suffix)}(?:-\\d{2})?$`), "");
}

/** Returns base name without supabase SHA, or null if pattern doesn't match. */
export function stripSupabaseSha(name: string): string | null {
  return isSupabaseShaName(name) ? "" : null;
}

// ----------------------------------------------------------------
// Apply / normalize
// ----------------------------------------------------------------

/** Append the -11d (or -11d-NN) suffix to a descriptive base name. */
export function applyElevenDSuffix(baseName: string, opts: ApplyOptions = {}): string {
  const suffix = opts.suffix ?? DEFAULT_SUFFIX;
  const base = sanitizeBase(baseName);
  if (!base) throw new Error("baseName cannot be empty");

  if (opts.multiInstance) {
    const idx = opts.index;
    if (idx === undefined || idx < MIN_INDEX || idx > MAX_INDEX) {
      throw new Error(`multi-instance index must be between ${MIN_INDEX} and ${MAX_INDEX}`);
    }
    return `${base}-${suffix}-${String(idx).padStart(2, "0")}`;
  }
  return `${base}-${suffix}`;
}

/**
 * Normalize a candidate name: strip supabase SHA, lower-case, dash-safe.
 * If baseName is empty/null/supabase-SHA, returns a caller-provided fallback.
 */
export function normalizeBase(baseName: string | undefined | null, fallback: string): string {
  if (!baseName || isSupabaseShaName(baseName)) {
    const safe = sanitizeBase(fallback);
    if (!safe) throw new Error("fallback base name is empty after sanitize");
    return safe;
  }
  return sanitizeBase(stripElevenDSuffix(baseName));
}

function sanitizeBase(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-") // non-safe → dash
    .replace(/-+/g, "-") // collapse dashes
    .replace(/^-+|-+$/g, ""); // trim dashes
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ----------------------------------------------------------------
// Collision resolver
// ----------------------------------------------------------------

export interface CollisionContext {
  /** Desired bare base name (without suffix). */
  base: string;
  suffix?: string;
  policy: NamingCollisionPolicy;
  /**
   * Returns existing names in the target scope. Caller typically feeds this
   * from `client.resources.list()` or a per-type listing. Wider = safer.
   */
  existing: () => Promise<string[]> | string[];
  /** Prompt callback for policy='prompt' — CLI provides inquirer, MCP throws. */
  prompt?: (suggestion: string) => Promise<string>;
}

export interface CollisionResult {
  name: string;
  collided: boolean;
  index?: number;
}

/**
 * Compute a final name that respects the collision policy.
 *
 *   error     → throw when name exists
 *   increment → walk 01..40 until free
 *   prompt    → ask caller (CLI wires inquirer); no callback → fall back to error
 */
export async function resolveName(ctx: CollisionContext): Promise<CollisionResult> {
  const suffix = ctx.suffix ?? DEFAULT_SUFFIX;
  const base = sanitizeBase(ctx.base);
  if (!base) throw new Error("base name cannot be empty");

  const taken = new Set(await ctx.existing());
  const single = applyElevenDSuffix(base, { suffix });

  if (!taken.has(single)) {
    return { name: single, collided: false };
  }

  switch (ctx.policy) {
    case "error":
      throw new Error(
        `Naming collision: "${single}" already exists. Set namingCollision="increment" to auto-number.`,
      );

    case "increment": {
      for (let i = MIN_INDEX; i <= MAX_INDEX; i++) {
        const candidate = applyElevenDSuffix(base, { suffix, multiInstance: true, index: i });
        if (!taken.has(candidate)) {
          return { name: candidate, collided: true, index: i };
        }
      }
      throw new Error(
        `Naming collision: "${base}-${suffix}-01".."40" all exhausted. Pick a different base name.`,
      );
    }

    case "prompt": {
      if (!ctx.prompt) {
        throw new Error(`Naming collision: "${single}" exists and no prompt handler wired.`);
      }
      const suggestion = firstFreeIncrement(base, taken, suffix) ?? single;
      const chosen = sanitizeBase(await ctx.prompt(suggestion));
      if (!chosen) throw new Error("Prompt returned empty name");
      if (taken.has(chosen)) {
        throw new Error(`"${chosen}" still collides.`);
      }
      return { name: chosen, collided: true };
    }

    default: {
      const _exhaustive: never = ctx.policy;
      throw new Error(`Unknown collision policy: ${String(_exhaustive)}`);
    }
  }
}

function firstFreeIncrement(base: string, taken: Set<string>, suffix: string): string | null {
  for (let i = MIN_INDEX; i <= MAX_INDEX; i++) {
    const c = applyElevenDSuffix(base, { suffix, multiInstance: true, index: i });
    if (!taken.has(c)) return c;
  }
  return null;
}

// ----------------------------------------------------------------
// Rename-on-create hook
// ----------------------------------------------------------------

export interface RenameHookContext {
  /** Resource UUID returned by the Coolify create endpoint. */
  uuid: string;
  /** Name the user asked for (may be undefined — we'll derive from fallback). */
  desiredName?: string;
  /** Fallback base when Coolify generated a supabase-<sha>. */
  fallbackBase: string;
  policy: NamingCollisionPolicy;
  suffix?: string;
  /** Lists existing names for collision probe. */
  existing: () => Promise<string[]> | string[];
  /** Issues the rename PATCH. Resource-specific — caller wires the right endpoint. */
  patchName: (uuid: string, name: string) => Promise<unknown>;
  /** Optional prompt for policy='prompt'. */
  prompt?: (suggestion: string) => Promise<string>;
}

export interface RenameHookResult {
  finalName: string;
  renamed: boolean;
  collided: boolean;
}

/**
 * Post-create rename hook. Safe to call unconditionally after every
 * Coolify create operation — if the resource already has a conformant
 * name the hook is a no-op.
 */
export async function renameOnCreate(ctx: RenameHookContext): Promise<RenameHookResult> {
  const base = normalizeBase(ctx.desiredName, ctx.fallbackBase);
  const resolved = await resolveName({
    base,
    suffix: ctx.suffix,
    policy: ctx.policy,
    existing: ctx.existing,
    prompt: ctx.prompt,
  });

  await ctx.patchName(ctx.uuid, resolved.name);
  return {
    finalName: resolved.name,
    renamed: true,
    collided: resolved.collided,
  };
}

// ----------------------------------------------------------------
// High-level create-with-naming orchestrator
// ----------------------------------------------------------------

export interface CreateWithNamingContext<TInput, TCreateResult> {
  /** The create call that returns { uuid }. Forwarded verbatim. */
  create: (input: TInput) => Promise<TCreateResult>;
  /** Payload to forward to the create call. */
  input: TInput;
  /** Desired descriptive name (may be undefined — falls back to fallbackBase). */
  desiredName?: string;
  /** Required fallback when Coolify or caller didn't supply a descriptive name. */
  fallbackBase: string;
  policy: NamingCollisionPolicy;
  suffix?: string;
  /** List existing names in scope — used for collision probe. */
  existing: () => Promise<string[]> | string[];
  /** Wire the resource-specific PATCH that renames. */
  patchName: (uuid: string, name: string) => Promise<unknown>;
  /** Optional prompt callback for policy='prompt'. */
  prompt?: (suggestion: string) => Promise<string>;
  /** Extract UUID from create result. Default: cast to { uuid }. */
  extractUuid?: (result: TCreateResult) => string;
}

export interface CreateWithNamingResult<TCreateResult> {
  create: TCreateResult;
  finalName: string;
  collided: boolean;
}

/**
 * Create-then-rename orchestrator. Runs the caller's create() first to
 * get a UUID, then immediately issues the rename PATCH with a collision-
 * resolved -11d name. Failure of the rename does NOT roll back the
 * resource — logs surface via thrown error so the caller decides.
 */
export async function createWithNaming<TInput, TCreateResult extends { uuid?: string }>(
  ctx: CreateWithNamingContext<TInput, TCreateResult>,
): Promise<CreateWithNamingResult<TCreateResult>> {
  const created = await ctx.create(ctx.input);
  const extract = ctx.extractUuid ?? ((r: TCreateResult) => r.uuid as string);
  const uuid = extract(created);
  if (!uuid) {
    throw new Error("create() did not return a UUID — cannot apply naming hook");
  }

  const hookResult = await renameOnCreate({
    uuid,
    desiredName: ctx.desiredName,
    fallbackBase: ctx.fallbackBase,
    policy: ctx.policy,
    suffix: ctx.suffix,
    existing: ctx.existing,
    patchName: ctx.patchName,
    prompt: ctx.prompt,
  });

  return {
    create: created,
    finalName: hookResult.finalName,
    collided: hookResult.collided,
  };
}

// ----------------------------------------------------------------
// Re-exports for tests
// ----------------------------------------------------------------

export const NAMING_CONSTANTS = {
  DEFAULT_SUFFIX,
  MIN_INDEX,
  MAX_INDEX,
  RESERVED_NAMES: Array.from(RESERVED_NAMES),
} as const;
