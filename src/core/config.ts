/**
 * Configuration — env + file-backed. Uses `conf` for XDG-compliant storage.
 *
 * Stub — `conf` integration and at-rest encryption land in PR #2.
 */

import type { NamingCollisionPolicy, OutputFormat, Verbosity } from "./types.js";

export interface ResolvedConfig {
  baseUrl: string;
  token: string;
  namingSuffix: string;
  namingCollision: NamingCollisionPolicy;
  outputFormat: OutputFormat;
  verbosity: Verbosity;
}

export interface ConfigSource {
  base_url?: string;
  token?: string;
  naming_suffix?: string;
  naming_collision?: NamingCollisionPolicy;
  output_format?: OutputFormat;
  verbosity?: Verbosity;
}

const DEFAULTS = {
  namingSuffix: "11d",
  namingCollision: "increment" as NamingCollisionPolicy,
  outputFormat: "table" as OutputFormat,
  verbosity: "standard" as Verbosity,
};

/** Resolve config: env wins, then file, then defaults. */
export function resolveConfig(file: ConfigSource = {}): ResolvedConfig {
  const baseUrl = process.env.COOLIFY_BASE_URL ?? file.base_url ?? "";
  const token = process.env.COOLIFY_TOKEN ?? file.token ?? "";

  if (!baseUrl) {
    throw new Error(
      "Missing Coolify base URL. Set COOLIFY_BASE_URL env var or run `coolify-11d init`.",
    );
  }
  if (!token) {
    throw new Error(
      "Missing Coolify API token. Set COOLIFY_TOKEN env var or run `coolify-11d init`.",
    );
  }

  return {
    baseUrl,
    token,
    namingSuffix: process.env.COOLIFY_NAMING_SUFFIX ?? file.naming_suffix ?? DEFAULTS.namingSuffix,
    namingCollision:
      (process.env.COOLIFY_NAMING_COLLISION as NamingCollisionPolicy | undefined) ??
      file.naming_collision ??
      DEFAULTS.namingCollision,
    outputFormat: file.output_format ?? DEFAULTS.outputFormat,
    verbosity: file.verbosity ?? DEFAULTS.verbosity,
  };
}
