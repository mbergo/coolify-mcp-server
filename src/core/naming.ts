/**
 * 11d naming convention engine.
 *
 * Rules (PRD §4):
 *   <descriptive-name>-11d          # single instance
 *   <descriptive-name>-11d-01..40   # multi-instance
 *
 * Coolify auto-generates `supabase-<sha>` names. This module strips that
 * pattern and applies the -11d suffix.
 */

const SUPABASE_SHA_RE = /^supabase-[a-f0-9]{6,}$/i;
const ELEVEND_SUFFIX_RE = /-11d(?:-\d{2})?$/;

export interface ApplyOptions {
  /** Custom suffix. Default: "11d". */
  suffix?: string;
  /** If true, append `-NN` index. */
  multiInstance?: boolean;
  /** Multi-instance index (1–40). Required when `multiInstance` is true. */
  index?: number;
}

/** Detect Coolify's auto-generated `supabase-<sha>` pattern. */
export function isSupabaseShaName(name: string): boolean {
  return SUPABASE_SHA_RE.test(name);
}

/** Strip a leading `supabase-<sha>` to a base name. Returns null if no match. */
export function stripSupabaseSha(name: string): string | null {
  if (!isSupabaseShaName(name)) return null;
  // The SHA carries no useful base name; caller must provide one.
  return "";
}

/** Already carries the -11d (or -11d-NN) suffix? */
export function hasElevenDSuffix(name: string, suffix = "11d"): boolean {
  const re = new RegExp(`-${suffix}(?:-\\d{2})?$`);
  return re.test(name);
}

/** Apply the -11d suffix to a descriptive base name. */
export function applyElevenDSuffix(baseName: string, opts: ApplyOptions = {}): string {
  const suffix = opts.suffix ?? "11d";
  const base = baseName.trim();
  if (!base) throw new Error("baseName cannot be empty");

  if (opts.multiInstance) {
    const idx = opts.index;
    if (idx === undefined || idx < 1 || idx > 40) {
      throw new Error("multi-instance index must be between 1 and 40");
    }
    return `${base}-${suffix}-${String(idx).padStart(2, "0")}`;
  }
  return `${base}-${suffix}`;
}

/** Validate a name conforms to the -11d convention. */
export function isValidElevenDName(name: string, suffix = "11d"): boolean {
  return hasElevenDSuffix(name, suffix) && !isSupabaseShaName(name);
}

// Marker used by tests — keeps tree-shaking predictable.
export const ELEVEND_REGEX = ELEVEND_SUFFIX_RE;
