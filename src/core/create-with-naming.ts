/**
 * High-level create helpers that bundle:
 *   1. the raw Coolify create* API call
 *   2. the post-create rename PATCH (via core/naming.createWithNaming)
 *   3. sane collision policy from resolved config
 *
 * CLI + MCP + connector call these instead of the raw api-client namespaces
 * when they need the -11d naming convention enforced.
 *
 * Raw api-client methods stay untouched for advanced callers.
 */

import type { CoolifyApiClient } from "./api-client.js";
import { type CreateWithNamingResult, createWithNaming } from "./naming.js";
import type {
  CreateDatabaseBase,
  CreateDeployKeyAppInput,
  CreateDockerComposeAppInput,
  CreateDockerImageAppInput,
  CreateDockerfileAppInput,
  CreateGithubAppInput,
  CreateProjectInput,
  CreatePublicAppInput,
  CreateServerInput,
  CreateServiceInput,
  NamingCollisionPolicy,
} from "./types.js";

// ----------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------

export interface NamingOptions {
  /** Collision policy (from resolved config). Default: "increment". */
  policy?: NamingCollisionPolicy;
  /** Custom suffix. Default: "11d". */
  suffix?: string;
  /** Prompt callback for policy="prompt" (CLI wires inquirer). */
  prompt?: (suggestion: string) => Promise<string>;
}

function policyOrDefault(p?: NamingCollisionPolicy): NamingCollisionPolicy {
  return p ?? "increment";
}

/** Returns name strings from any entity list that has { name }. */
async function nameList<T extends { name?: string | null }>(
  source: Promise<T[]> | T[],
): Promise<string[]> {
  const items = await source;
  return items.map((i) => i.name ?? "").filter(Boolean);
}

// ----------------------------------------------------------------
// Applications
// ----------------------------------------------------------------

export interface CreateAppOptions extends NamingOptions {
  /** Descriptive name (becomes `<name>-11d`). If absent, uses fallbackBase. */
  name?: string;
  /** Required fallback when Coolify generates a supabase-<sha>. */
  fallbackBase: string;
}

function appNaming(
  client: CoolifyApiClient,
  opts: CreateAppOptions,
  create: (input: unknown) => Promise<{ uuid: string }>,
  input: unknown,
) {
  return createWithNaming({
    create: (i) => create(i),
    input,
    desiredName: opts.name,
    fallbackBase: opts.fallbackBase,
    policy: policyOrDefault(opts.policy),
    suffix: opts.suffix,
    prompt: opts.prompt,
    existing: () => nameList(client.apps.list()),
    patchName: (uuid, name) => client.apps.update(uuid, { name }),
  });
}

export function createPublicApp(
  client: CoolifyApiClient,
  input: CreatePublicAppInput,
  opts: CreateAppOptions,
): Promise<CreateWithNamingResult<{ uuid: string }>> {
  return appNaming(client, opts, (i) => client.apps.createPublic(i as CreatePublicAppInput), input);
}

export function createGithubApp(
  client: CoolifyApiClient,
  input: CreateGithubAppInput,
  opts: CreateAppOptions,
): Promise<CreateWithNamingResult<{ uuid: string }>> {
  return appNaming(client, opts, (i) => client.apps.createGithub(i as CreateGithubAppInput), input);
}

export function createDeployKeyApp(
  client: CoolifyApiClient,
  input: CreateDeployKeyAppInput,
  opts: CreateAppOptions,
): Promise<CreateWithNamingResult<{ uuid: string }>> {
  return appNaming(
    client,
    opts,
    (i) => client.apps.createDeployKey(i as CreateDeployKeyAppInput),
    input,
  );
}

export function createDockerfileApp(
  client: CoolifyApiClient,
  input: CreateDockerfileAppInput,
  opts: CreateAppOptions,
): Promise<CreateWithNamingResult<{ uuid: string }>> {
  return appNaming(
    client,
    opts,
    (i) => client.apps.createDockerfile(i as CreateDockerfileAppInput),
    input,
  );
}

export function createDockerImageApp(
  client: CoolifyApiClient,
  input: CreateDockerImageAppInput,
  opts: CreateAppOptions,
): Promise<CreateWithNamingResult<{ uuid: string }>> {
  return appNaming(
    client,
    opts,
    (i) => client.apps.createDockerImage(i as CreateDockerImageAppInput),
    input,
  );
}

export function createDockerComposeApp(
  client: CoolifyApiClient,
  input: CreateDockerComposeAppInput,
  opts: CreateAppOptions,
): Promise<CreateWithNamingResult<{ uuid: string }>> {
  return appNaming(
    client,
    opts,
    (i) => client.apps.createDockerCompose(i as CreateDockerComposeAppInput),
    input,
  );
}

// ----------------------------------------------------------------
// Databases
// ----------------------------------------------------------------

export interface CreateDatabaseOptions extends NamingOptions {
  name?: string;
  fallbackBase: string;
}

type DbEngineMethod =
  | "createPostgres"
  | "createMysql"
  | "createMariadb"
  | "createMongodb"
  | "createRedis"
  | "createClickhouse"
  | "createDragonfly"
  | "createKeydb";

function dbNaming(
  client: CoolifyApiClient,
  engineMethod: DbEngineMethod,
  input: CreateDatabaseBase & Record<string, unknown>,
  opts: CreateDatabaseOptions,
): Promise<CreateWithNamingResult<{ uuid: string }>> {
  return createWithNaming({
    create: (i) => client.db[engineMethod](i as CreateDatabaseBase & Record<string, unknown>),
    input,
    desiredName: opts.name,
    fallbackBase: opts.fallbackBase,
    policy: policyOrDefault(opts.policy),
    suffix: opts.suffix,
    prompt: opts.prompt,
    existing: () => nameList(client.db.list()),
    patchName: (uuid, name) => client.db.update(uuid, { name }),
  });
}

export const createPostgres = (
  c: CoolifyApiClient,
  input: CreateDatabaseBase & Record<string, unknown>,
  opts: CreateDatabaseOptions,
) => dbNaming(c, "createPostgres", input, opts);
export const createMysql = (
  c: CoolifyApiClient,
  input: CreateDatabaseBase & Record<string, unknown>,
  opts: CreateDatabaseOptions,
) => dbNaming(c, "createMysql", input, opts);
export const createMariadb = (
  c: CoolifyApiClient,
  input: CreateDatabaseBase & Record<string, unknown>,
  opts: CreateDatabaseOptions,
) => dbNaming(c, "createMariadb", input, opts);
export const createMongodb = (
  c: CoolifyApiClient,
  input: CreateDatabaseBase & Record<string, unknown>,
  opts: CreateDatabaseOptions,
) => dbNaming(c, "createMongodb", input, opts);
export const createRedis = (
  c: CoolifyApiClient,
  input: CreateDatabaseBase & Record<string, unknown>,
  opts: CreateDatabaseOptions,
) => dbNaming(c, "createRedis", input, opts);
export const createClickhouse = (
  c: CoolifyApiClient,
  input: CreateDatabaseBase & Record<string, unknown>,
  opts: CreateDatabaseOptions,
) => dbNaming(c, "createClickhouse", input, opts);
export const createDragonfly = (
  c: CoolifyApiClient,
  input: CreateDatabaseBase & Record<string, unknown>,
  opts: CreateDatabaseOptions,
) => dbNaming(c, "createDragonfly", input, opts);
export const createKeydb = (
  c: CoolifyApiClient,
  input: CreateDatabaseBase & Record<string, unknown>,
  opts: CreateDatabaseOptions,
) => dbNaming(c, "createKeydb", input, opts);

// ----------------------------------------------------------------
// Services
// ----------------------------------------------------------------

export interface CreateServiceOptions extends NamingOptions {
  name?: string;
  fallbackBase: string;
}

export function createService(
  client: CoolifyApiClient,
  input: CreateServiceInput,
  opts: CreateServiceOptions,
): Promise<CreateWithNamingResult<{ uuid: string }>> {
  return createWithNaming({
    create: (i) => client.svc.create(i as CreateServiceInput),
    input,
    desiredName: opts.name,
    fallbackBase: opts.fallbackBase,
    policy: policyOrDefault(opts.policy),
    suffix: opts.suffix,
    prompt: opts.prompt,
    existing: () => nameList(client.svc.list()),
    patchName: (uuid, name) => client.svc.update(uuid, { name }),
  });
}

// ----------------------------------------------------------------
// Projects
// ----------------------------------------------------------------

export interface CreateProjectOptions extends NamingOptions {
  fallbackBase?: string;
}

export function createProject(
  client: CoolifyApiClient,
  input: CreateProjectInput,
  opts: CreateProjectOptions = {},
): Promise<CreateWithNamingResult<{ uuid: string }>> {
  return createWithNaming({
    create: (i) => client.project.create(i as CreateProjectInput),
    input,
    desiredName: input.name,
    fallbackBase: opts.fallbackBase ?? input.name ?? "project",
    policy: policyOrDefault(opts.policy),
    suffix: opts.suffix,
    prompt: opts.prompt,
    existing: () => nameList(client.project.list()),
    patchName: (uuid, name) => client.project.update(uuid, { name }),
  });
}

// ----------------------------------------------------------------
// Servers
// ----------------------------------------------------------------

export interface CreateServerOptions extends NamingOptions {
  fallbackBase?: string;
}

export function createServer(
  client: CoolifyApiClient,
  input: CreateServerInput,
  opts: CreateServerOptions = {},
): Promise<CreateWithNamingResult<{ uuid: string }>> {
  return createWithNaming({
    create: (i) => client.server.create(i as CreateServerInput),
    input,
    desiredName: input.name,
    fallbackBase: opts.fallbackBase ?? input.name ?? "server",
    policy: policyOrDefault(opts.policy),
    suffix: opts.suffix,
    prompt: opts.prompt,
    existing: () => nameList(client.server.list()),
    patchName: (uuid, name) => client.server.update(uuid, { name }),
  });
}
