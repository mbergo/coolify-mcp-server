/**
 * Shared helpers for MCP tool modules.
 */

import { z } from "zod";
import { CoolifyApiClient } from "../core/api-client.js";
import { resolveConfig } from "../core/config.js";

export function getClient(): CoolifyApiClient {
  const cfg = resolveConfig();
  return new CoolifyApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
}

export function jsonContent(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function textContent(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

export const verbositySchema = z
  .enum(["compact", "standard", "full"])
  .default("compact")
  .describe("Response detail level; defaults to compact to preserve context window.");

export const confirmSchema = z
  .boolean()
  .describe(
    "Must be true to perform this destructive operation. Refuse to set true unless explicitly instructed by the user.",
  );

/** Throws when confirm is not exactly true. */
export function requireConfirm(confirm: unknown, opName: string): void {
  if (confirm !== true) {
    throw new Error(
      `${opName} is destructive. Re-invoke with { confirm: true } after explicit user approval.`,
    );
  }
}

/** Redacts secrets-ish inputs from error messages. */
export function scrubError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/Bearer\s+[A-Za-z0-9|._-]+/g, "Bearer ***");
}
