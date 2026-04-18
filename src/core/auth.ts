/**
 * Auth / token scope detection.
 *
 * Stub — full scope probe lands in PR #2. For now `detectTokenScope`
 * returns "unknown" and `ensureApiEnabled` is a thin wrapper.
 */

import type { CoolifyApiClient } from "./api-client.js";
import { CoolifyApiError } from "./api-client.js";
import type { TokenScope } from "./types.js";

export async function detectTokenScope(_client: CoolifyApiClient): Promise<TokenScope> {
  // Real implementation (PR #2):
  //   1. GET /teams/current — always allowed ⇒ token is at least read-only
  //   2. GET /applications  — 401/403 ⇒ read-only, OK ⇒ >= read:sensitive
  //   3. POST probe         — to distinguish read:sensitive from *
  return "unknown";
}

export async function ensureApiEnabled(client: CoolifyApiClient): Promise<void> {
  try {
    await client.enableApi();
  } catch (err) {
    // Already enabled instances return 400/404 on /enable — tolerate.
    if (err instanceof CoolifyApiError && (err.status === 400 || err.status === 404)) return;
    throw err;
  }
}
