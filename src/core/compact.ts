/**
 * Compact read helpers — thin wrappers over api-client list/get that
 * pipe results through the optimizer with the caller's verbosity + scope.
 *
 * CLI + MCP surfaces use these by default (compact). Callers that need
 * the raw response can drop down to client.<ns>.<method>() directly.
 */

import type { CoolifyApiClient } from "./api-client.js";
import {
  type EntityKind,
  type OptimizeOptions,
  optimizeEntity,
  optimizeList,
} from "./optimizer.js";
import type { TokenScope, Verbosity } from "./types.js";

// ----------------------------------------------------------------
// Shared options
// ----------------------------------------------------------------

export interface CompactOptions {
  /** Default: "compact". */
  verbosity?: Verbosity;
  /** Token scope — drives sensitive-field redaction. Default: "unknown". */
  scope?: TokenScope;
}

function optsFor(kind: EntityKind, opts: CompactOptions): OptimizeOptions {
  return {
    kind,
    verbosity: opts.verbosity ?? "compact",
    scope: opts.scope ?? "unknown",
  };
}

// ----------------------------------------------------------------
// Applications
// ----------------------------------------------------------------

export async function listApplications<T = unknown>(
  client: CoolifyApiClient,
  opts: CompactOptions & { server_uuid?: string; project_uuid?: string } = {},
): Promise<T[]> {
  const raw = await client.apps.list({
    server_uuid: opts.server_uuid,
    project_uuid: opts.project_uuid,
  });
  return optimizeList<T>(raw as unknown[], optsFor("application", opts));
}

export async function getApplication<T = unknown>(
  client: CoolifyApiClient,
  uuid: string,
  opts: CompactOptions = {},
): Promise<T> {
  const raw = await client.apps.get(uuid);
  return optimizeEntity<T>(raw, optsFor("application", opts));
}

// ----------------------------------------------------------------
// Databases
// ----------------------------------------------------------------

export async function listDatabases<T = unknown>(
  client: CoolifyApiClient,
  opts: CompactOptions = {},
): Promise<T[]> {
  const raw = await client.db.list();
  return optimizeList<T>(raw as unknown[], optsFor("database", opts));
}

export async function getDatabase<T = unknown>(
  client: CoolifyApiClient,
  uuid: string,
  opts: CompactOptions = {},
): Promise<T> {
  const raw = await client.db.get(uuid);
  return optimizeEntity<T>(raw, optsFor("database", opts));
}

// ----------------------------------------------------------------
// Services
// ----------------------------------------------------------------

export async function listServices<T = unknown>(
  client: CoolifyApiClient,
  opts: CompactOptions = {},
): Promise<T[]> {
  const raw = await client.svc.list();
  return optimizeList<T>(raw as unknown[], optsFor("service", opts));
}

export async function getService<T = unknown>(
  client: CoolifyApiClient,
  uuid: string,
  opts: CompactOptions = {},
): Promise<T> {
  const raw = await client.svc.get(uuid);
  return optimizeEntity<T>(raw, optsFor("service", opts));
}

// ----------------------------------------------------------------
// Deployments
// ----------------------------------------------------------------

export async function listDeployments<T = unknown>(
  client: CoolifyApiClient,
  opts: CompactOptions & { limit?: number } = {},
): Promise<T[]> {
  const raw = await client.deploy.list(opts.limit);
  return optimizeList<T>(raw as unknown[], optsFor("deployment", opts));
}

export async function getDeployment<T = unknown>(
  client: CoolifyApiClient,
  uuid: string,
  opts: CompactOptions = {},
): Promise<T> {
  const raw = await client.deploy.get(uuid);
  return optimizeEntity<T>(raw, optsFor("deployment", opts));
}

// ----------------------------------------------------------------
// Servers
// ----------------------------------------------------------------

export async function listServers<T = unknown>(
  client: CoolifyApiClient,
  opts: CompactOptions = {},
): Promise<T[]> {
  const raw = await client.server.list();
  return optimizeList<T>(raw as unknown[], optsFor("server", opts));
}

export async function getServer<T = unknown>(
  client: CoolifyApiClient,
  uuid: string,
  opts: CompactOptions = {},
): Promise<T> {
  const raw = await client.server.get(uuid);
  return optimizeEntity<T>(raw, optsFor("server", opts));
}

// ----------------------------------------------------------------
// Projects
// ----------------------------------------------------------------

export async function listProjects<T = unknown>(
  client: CoolifyApiClient,
  opts: CompactOptions = {},
): Promise<T[]> {
  const raw = await client.project.list();
  return optimizeList<T>(raw as unknown[], optsFor("project", opts));
}

export async function getProject<T = unknown>(
  client: CoolifyApiClient,
  uuid: string,
  opts: CompactOptions = {},
): Promise<T> {
  const raw = await client.project.get(uuid);
  return optimizeEntity<T>(raw, optsFor("project", opts));
}
