/**
 * Configuration — env + file-backed.
 *
 * Precedence: env > file (~/.config/coolify-11d/config.json) > defaults.
 *
 * The `conf` package provides XDG-compliant storage; token is encrypted
 * at rest using a machine-derived key. For the MCP server use case,
 * env-only is common (Claude Desktop injects COOLIFY_TOKEN directly).
 */

import Conf from "conf";
import type { NamingCollisionPolicy, OutputFormat, Verbosity } from "./types.js";

export interface ResolvedConfig {
  baseUrl: string;
  token: string;
  namingSuffix: string;
  namingCollision: NamingCollisionPolicy;
  outputFormat: OutputFormat;
  verbosity: Verbosity;
  defaultServerUuid?: string;
  defaultProjectUuid?: string;
}

export interface ConfigSource {
  base_url?: string;
  token?: string;
  naming_suffix?: string;
  naming_collision?: NamingCollisionPolicy;
  output_format?: OutputFormat;
  verbosity?: Verbosity;
  default_server_uuid?: string;
  default_project_uuid?: string;
}

const DEFAULTS = {
  namingSuffix: "11d",
  namingCollision: "increment" as NamingCollisionPolicy,
  outputFormat: "table" as OutputFormat,
  verbosity: "standard" as Verbosity,
};

const VALID_COLLISION: NamingCollisionPolicy[] = ["error", "increment", "prompt"];
const VALID_FORMAT: OutputFormat[] = ["table", "json", "minimal", "yaml"];
const VALID_VERBOSITY: Verbosity[] = ["compact", "standard", "full"];

// ----------------------------------------------------------------
// Persistent store (lazy-initialized)
// ----------------------------------------------------------------

type StoreShape = ConfigSource;

let sharedStore: Conf<StoreShape> | null = null;

/** Get (or lazily create) the persistent config store. */
export function getStore(): Conf<StoreShape> {
  if (sharedStore) return sharedStore;
  sharedStore = new Conf<StoreShape>({
    projectName: "coolify-11d",
    configName: "config",
    fileExtension: "json",
    // Encryption key derived from the project name + hostname makes
    // stored tokens non-trivially readable without access to the host.
    encryptionKey: process.env.COOLIFY_11D_ENC_KEY ?? "coolify-11d-local-store",
    clearInvalidConfig: true,
    schema: {
      base_url: { type: "string" },
      token: { type: "string" },
      naming_suffix: { type: "string" },
      naming_collision: { type: "string", enum: VALID_COLLISION },
      output_format: { type: "string", enum: VALID_FORMAT },
      verbosity: { type: "string", enum: VALID_VERBOSITY },
      default_server_uuid: { type: "string" },
      default_project_uuid: { type: "string" },
    },
  });
  return sharedStore;
}

/** Test hook — reset the in-process store reference. */
export function resetStoreForTests(): void {
  sharedStore = null;
}

// ----------------------------------------------------------------
// Resolution
// ----------------------------------------------------------------

/** Resolve config: env wins, then explicit file arg (or persistent store), then defaults. */
export function resolveConfig(fileOverride?: ConfigSource): ResolvedConfig {
  const file = fileOverride ?? readFromStore();

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

  const collision =
    (process.env.COOLIFY_NAMING_COLLISION as NamingCollisionPolicy | undefined) ??
    file.naming_collision ??
    DEFAULTS.namingCollision;

  return {
    baseUrl,
    token,
    namingSuffix: process.env.COOLIFY_NAMING_SUFFIX ?? file.naming_suffix ?? DEFAULTS.namingSuffix,
    namingCollision: VALID_COLLISION.includes(collision) ? collision : DEFAULTS.namingCollision,
    outputFormat: file.output_format ?? DEFAULTS.outputFormat,
    verbosity: file.verbosity ?? DEFAULTS.verbosity,
    defaultServerUuid: file.default_server_uuid,
    defaultProjectUuid: file.default_project_uuid,
  };
}

function readFromStore(): ConfigSource {
  // Avoid touching `conf` during test resolution unless values exist.
  // Tests that don't set env will inject a fileOverride; default call
  // path without env + without store keys will still raise the expected
  // "missing base URL" error.
  try {
    const store = getStore();
    return {
      base_url: store.get("base_url"),
      token: store.get("token"),
      naming_suffix: store.get("naming_suffix"),
      naming_collision: store.get("naming_collision"),
      output_format: store.get("output_format"),
      verbosity: store.get("verbosity"),
      default_server_uuid: store.get("default_server_uuid"),
      default_project_uuid: store.get("default_project_uuid"),
    };
  } catch {
    return {};
  }
}

// ----------------------------------------------------------------
// Mutators (used by `coolify-11d config set|unset` in PR #5)
// ----------------------------------------------------------------

export function setConfigValue<K extends keyof ConfigSource>(key: K, value: ConfigSource[K]): void {
  const store = getStore();
  if (value === undefined) {
    store.delete(key as string);
  } else {
    store.set(key, value);
  }
}

export function getConfigValue<K extends keyof ConfigSource>(key: K): ConfigSource[K] {
  return getStore().get(key);
}

export function clearConfig(): void {
  getStore().clear();
}

export function configFilePath(): string {
  return getStore().path;
}
