/**
 * Auth — token scope detection + API-enable helper.
 *
 * Coolify token scopes:
 *   read-only         — public read, sensitive fields redacted
 *   read:sensitive    — read + sensitive field visibility
 *   view:sensitive    — alias for sensitive read
 *   *                 — full CRUD
 *
 * Detection probes (best-effort, no writes):
 *   1. GET /teams/current        — any valid token
 *   2. GET /applications         — 401/403 ⇒ read-only | api-disabled
 *   3. GET /security/keys        — 401/403 on read:sensitive, 200 on `*`
 *                                  (private keys are sensitive)
 */

import type { CoolifyApiClient } from "./api-client.js";
import { CoolifyApiError } from "./api-client.js";
import type { TokenScope } from "./types.js";

export interface ScopeProbeResult {
  scope: TokenScope;
  canRead: boolean;
  canReadSensitive: boolean;
  canWrite: boolean;
  apiEnabled: boolean;
  notes: string[];
}

/** Fast path — returns unknown if any probe fails unexpectedly. */
export async function detectTokenScope(client: CoolifyApiClient): Promise<TokenScope> {
  return (await probeTokenScope(client)).scope;
}

/** Full probe result for diagnostics / UI. */
export async function probeTokenScope(client: CoolifyApiClient): Promise<ScopeProbeResult> {
  const notes: string[] = [];
  let apiEnabled = true;
  let canRead = false;
  let canReadSensitive = false;
  let canWrite = false;

  // Probe 1: /teams/current — if this fails with 401, token is invalid entirely
  try {
    await client.team.current();
  } catch (err) {
    if (err instanceof CoolifyApiError) {
      if (err.isApiDisabled()) {
        apiEnabled = false;
        notes.push("API appears disabled — call system.enableApi() once.");
      }
      if (err.status === 401) {
        return {
          scope: "unknown",
          canRead: false,
          canReadSensitive: false,
          canWrite: false,
          apiEnabled,
          notes: [...notes, "Token rejected by /teams/current (401)."],
        };
      }
    }
  }

  // Probe 2: /applications — read-only minimum
  try {
    await client.apps.list();
    canRead = true;
  } catch (err) {
    if (err instanceof CoolifyApiError && (err.status === 401 || err.status === 403)) {
      notes.push("Cannot list applications — scope probably insufficient.");
    } else {
      throw err;
    }
  }

  // Probe 3: /security/keys — read:sensitive or *
  try {
    await client.keys.list();
    canReadSensitive = true;
  } catch (err) {
    if (!(err instanceof CoolifyApiError) || (err.status !== 401 && err.status !== 403)) {
      throw err;
    }
  }

  // Probe 4: distinguishing `*` from `read:sensitive` without writing is
  // impossible in a safe way. We infer: if sensitive read works, token
  // likely has `*` because Coolify typically issues those together. Mark
  // `canWrite` as "assumed true" when sensitive reads succeed; callers
  // should still handle 403s on writes.
  if (canReadSensitive) {
    canWrite = true;
    notes.push("Sensitive reads succeeded — assuming `*` scope. Writes may still 403.");
  }

  const scope: TokenScope = !canRead
    ? "unknown"
    : canWrite
      ? "*"
      : canReadSensitive
        ? "read:sensitive"
        : "read-only";

  return { scope, canRead, canReadSensitive, canWrite, apiEnabled, notes };
}

/** Ensure API is enabled. Idempotent — ignores "already enabled". */
export async function ensureApiEnabled(client: CoolifyApiClient): Promise<void> {
  try {
    await client.system.enableApi();
  } catch (err) {
    if (err instanceof CoolifyApiError && (err.status === 400 || err.status === 404)) return;
    throw err;
  }
}
