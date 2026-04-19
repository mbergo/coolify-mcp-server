/**
 * coolify-11d CLI entry point.
 *
 * PR #4: read commands (list/get) for apps / db / svc / servers / projects
 * with compact optimizer output + `--format` flag. Writes + interactive
 * wizard land in PR #5.
 */

import { Command } from "commander";
import { CoolifyApiClient } from "../core/api-client.js";
import {
  getApplication,
  getDatabase,
  getDeployment,
  getProject,
  getServer,
  getService,
  listApplications,
  listDatabases,
  listDeployments,
  listProjects,
  listServers,
  listServices,
} from "../core/compact.js";
import { resolveConfig } from "../core/config.js";
import { searchResources } from "../core/search.js";
import type { OutputFormat, Verbosity } from "../core/types.js";
import { formatOutput } from "./formatters/output.js";

const program = new Command();

// ----------------------------------------------------------------
// Shared client + global options
// ----------------------------------------------------------------

interface GlobalOpts {
  format?: OutputFormat;
  verbose?: boolean;
  verbosity?: Verbosity;
}

function getClient(): CoolifyApiClient {
  const cfg = resolveConfig();
  return new CoolifyApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
}

function resolveVerbosity(g: GlobalOpts): Verbosity {
  if (g.verbose) return "full";
  return g.verbosity ?? "compact";
}

function resolveFormat(g: GlobalOpts): OutputFormat {
  return g.format ?? "table";
}

function printResult(program: Command, result: unknown) {
  const g = program.opts<GlobalOpts>();
  console.log(formatOutput(result, { format: resolveFormat(g) }));
}

// ----------------------------------------------------------------
// Program shell
// ----------------------------------------------------------------

program
  .name("coolify-11d")
  .description("CLI for self-hosted Coolify with the -11d naming convention")
  .version("0.1.0")
  .option("-f, --format <format>", "Output format: table | json | minimal | yaml", "table")
  .option("--verbosity <level>", "Detail level: compact | standard | full", "compact")
  .option("--verbose", "Alias for --verbosity=full");

// ----------------------------------------------------------------
// system
// ----------------------------------------------------------------

const system = program.command("system").description("System-level operations");

system
  .command("health")
  .description("GET /api/health — ping the Coolify instance")
  .action(async () => {
    const c = getClient();
    console.log(await c.health());
  });

system
  .command("version")
  .description("GET /api/v1/version — show Coolify version")
  .action(async () => {
    const c = getClient();
    console.log(await c.version());
  });

system
  .command("enable-api")
  .description("GET /api/v1/enable — enable API access")
  .action(async () => {
    const c = getClient();
    await c.enableApi();
    console.log("API enabled.");
  });

// ----------------------------------------------------------------
// apps
// ----------------------------------------------------------------

const apps = program.command("apps").description("Application management");

apps
  .command("list")
  .description("List applications")
  .option("--server <uuid>", "Filter by server UUID")
  .option("--project <uuid>", "Filter by project UUID")
  .action(async (opts: { server?: string; project?: string }) => {
    const g = program.opts<GlobalOpts>();
    const result = await listApplications(getClient(), {
      verbosity: resolveVerbosity(g),
      server_uuid: opts.server,
      project_uuid: opts.project,
    });
    printResult(program, result);
  });

apps
  .command("get <uuid>")
  .description("Get a single application")
  .action(async (uuid: string) => {
    const g = program.opts<GlobalOpts>();
    const result = await getApplication(getClient(), uuid, { verbosity: resolveVerbosity(g) });
    printResult(program, result);
  });

apps
  .command("start <uuid>")
  .description("Start an application")
  .action(async (uuid: string) => {
    await getClient().apps.start(uuid);
    console.log(`Started ${uuid}`);
  });

apps
  .command("stop <uuid>")
  .description("Stop an application")
  .action(async (uuid: string) => {
    await getClient().apps.stop(uuid);
    console.log(`Stopped ${uuid}`);
  });

apps
  .command("restart <uuid>")
  .description("Restart an application")
  .action(async (uuid: string) => {
    await getClient().apps.restart(uuid);
    console.log(`Restarted ${uuid}`);
  });

// ----------------------------------------------------------------
// db
// ----------------------------------------------------------------

const db = program.command("db").description("Database management");

db.command("list")
  .description("List databases")
  .action(async () => {
    const g = program.opts<GlobalOpts>();
    const result = await listDatabases(getClient(), { verbosity: resolveVerbosity(g) });
    printResult(program, result);
  });

db.command("get <uuid>")
  .description("Get a single database")
  .action(async (uuid: string) => {
    const g = program.opts<GlobalOpts>();
    const result = await getDatabase(getClient(), uuid, { verbosity: resolveVerbosity(g) });
    printResult(program, result);
  });

db.command("start <uuid>")
  .description("Start a database")
  .action(async (uuid: string) => {
    await getClient().db.start(uuid);
    console.log(`Started ${uuid}`);
  });

db.command("stop <uuid>")
  .description("Stop a database")
  .action(async (uuid: string) => {
    await getClient().db.stop(uuid);
    console.log(`Stopped ${uuid}`);
  });

db.command("restart <uuid>")
  .description("Restart a database")
  .action(async (uuid: string) => {
    await getClient().db.restart(uuid);
    console.log(`Restarted ${uuid}`);
  });

// ----------------------------------------------------------------
// svc
// ----------------------------------------------------------------

const svc = program.command("svc").description("Service management");

svc
  .command("list")
  .description("List services")
  .action(async () => {
    const g = program.opts<GlobalOpts>();
    const result = await listServices(getClient(), { verbosity: resolveVerbosity(g) });
    printResult(program, result);
  });

svc
  .command("get <uuid>")
  .description("Get a single service")
  .action(async (uuid: string) => {
    const g = program.opts<GlobalOpts>();
    const result = await getService(getClient(), uuid, { verbosity: resolveVerbosity(g) });
    printResult(program, result);
  });

// ----------------------------------------------------------------
// deploy
// ----------------------------------------------------------------

const deploy = program.command("deploy").description("Deployments");

deploy
  .command("list")
  .description("List recent deployments")
  .option("--limit <n>", "Max deployments", "20")
  .action(async (opts: { limit?: string }) => {
    const g = program.opts<GlobalOpts>();
    const result = await listDeployments(getClient(), {
      verbosity: resolveVerbosity(g),
      limit: opts.limit ? Number(opts.limit) : undefined,
    });
    printResult(program, result);
  });

deploy
  .command("get <uuid>")
  .description("Get a deployment")
  .action(async (uuid: string) => {
    const g = program.opts<GlobalOpts>();
    const result = await getDeployment(getClient(), uuid, { verbosity: resolveVerbosity(g) });
    printResult(program, result);
  });

deploy
  .command("trigger")
  .description("Trigger a deploy (pass --uuid <app-uuid> or --tag <name>)")
  .option("--uuid <uuid>", "Application UUID")
  .option("--tag <tag>", "Image tag")
  .option("--force", "Force rebuild")
  .action(async (opts: { uuid?: string; tag?: string; force?: boolean }) => {
    const result = await getClient().deploy.trigger(opts);
    console.log(JSON.stringify(result, null, 2));
  });

// ----------------------------------------------------------------
// server
// ----------------------------------------------------------------

const server = program.command("server").description("Server management");

server
  .command("list")
  .description("List servers")
  .action(async () => {
    const g = program.opts<GlobalOpts>();
    const result = await listServers(getClient(), { verbosity: resolveVerbosity(g) });
    printResult(program, result);
  });

server
  .command("get <uuid>")
  .description("Get a single server")
  .action(async (uuid: string) => {
    const g = program.opts<GlobalOpts>();
    const result = await getServer(getClient(), uuid, { verbosity: resolveVerbosity(g) });
    printResult(program, result);
  });

// ----------------------------------------------------------------
// project
// ----------------------------------------------------------------

const project = program.command("project").description("Project management");

project
  .command("list")
  .description("List projects")
  .action(async () => {
    const g = program.opts<GlobalOpts>();
    const result = await listProjects(getClient(), { verbosity: resolveVerbosity(g) });
    printResult(program, result);
  });

project
  .command("get <uuid>")
  .description("Get a single project")
  .action(async (uuid: string) => {
    const g = program.opts<GlobalOpts>();
    const result = await getProject(getClient(), uuid, { verbosity: resolveVerbosity(g) });
    printResult(program, result);
  });

// ----------------------------------------------------------------
// search
// ----------------------------------------------------------------

program
  .command("search <query>")
  .description("Smart search across apps/db/svc/servers/projects")
  .option("--kind <kinds...>", "Filter kinds: application database service server project")
  .option("--limit <n>", "Max results", "20")
  .option("--threshold <n>", "Fuzzy threshold (0..1)", "0.4")
  .action(async (query: string, opts: { kind?: string[]; limit?: string; threshold?: string }) => {
    const result = await searchResources(getClient(), query, {
      // biome-ignore lint/suspicious/noExplicitAny: commander variadic passes strings
      kinds: opts.kind as any,
      limit: opts.limit ? Number(opts.limit) : undefined,
      fuzzyThreshold: opts.threshold ? Number(opts.threshold) : undefined,
    });
    printResult(program, result);
  });

// ----------------------------------------------------------------
// init (stub)
// ----------------------------------------------------------------

program
  .command("init")
  .description("Interactive setup wizard (full wizard lands in PR #5)")
  .action(() => {
    console.log("coolify-11d init — interactive wizard not yet implemented.");
    console.log("Set COOLIFY_BASE_URL and COOLIFY_TOKEN env vars for now.");
  });

// ----------------------------------------------------------------
// Entry
// ----------------------------------------------------------------

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
