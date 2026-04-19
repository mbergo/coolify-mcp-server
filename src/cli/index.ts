/**
 * coolify-11d CLI entry point.
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
import { registerAppsWriteCommands } from "./commands/apps-write.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerDbWriteCommands } from "./commands/db-write.js";
import { runInit } from "./commands/init.js";
import {
  registerProjectWriteCommands,
  registerServerWriteCommands,
  registerSvcWriteCommands,
} from "./commands/other-write.js";
import { formatOutput } from "./formatters/output.js";
import { confirmDestructive } from "./prompt.js";

const program = new Command();

// ----------------------------------------------------------------
// Globals
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

function printResult(result: unknown) {
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
// init + config
// ----------------------------------------------------------------

program
  .command("init")
  .description("Interactive setup wizard")
  .action(async () => {
    await runInit();
  });

registerConfigCommand(program);

// ----------------------------------------------------------------
// system
// ----------------------------------------------------------------

const system = program.command("system").description("System-level operations");

system
  .command("health")
  .description("GET /api/health")
  .action(async () => {
    console.log(await getClient().health());
  });

system
  .command("version")
  .description("GET /api/v1/version")
  .action(async () => {
    console.log(await getClient().version());
  });

system
  .command("enable-api")
  .description("GET /api/v1/enable")
  .action(async () => {
    await getClient().enableApi();
    console.log("API enabled.");
  });

// ----------------------------------------------------------------
// apps (read + lifecycle)
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
    printResult(result);
  });

apps
  .command("get <uuid>")
  .description("Get a single application")
  .action(async (uuid: string) => {
    const g = program.opts<GlobalOpts>();
    const result = await getApplication(getClient(), uuid, { verbosity: resolveVerbosity(g) });
    printResult(result);
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
  .option("-y, --yes", "Skip confirmation")
  .action(async (uuid: string, opts: { yes?: boolean }) => {
    await confirmDestructive("stop application", uuid, Boolean(opts.yes));
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

registerAppsWriteCommands(apps, getClient);

// ----------------------------------------------------------------
// db (read + lifecycle)
// ----------------------------------------------------------------

const db = program.command("db").description("Database management");

db.command("list")
  .description("List databases")
  .action(async () => {
    const g = program.opts<GlobalOpts>();
    const result = await listDatabases(getClient(), { verbosity: resolveVerbosity(g) });
    printResult(result);
  });

db.command("get <uuid>")
  .description("Get a single database")
  .action(async (uuid: string) => {
    const g = program.opts<GlobalOpts>();
    const result = await getDatabase(getClient(), uuid, { verbosity: resolveVerbosity(g) });
    printResult(result);
  });

db.command("start <uuid>")
  .description("Start a database")
  .action(async (uuid: string) => {
    await getClient().db.start(uuid);
    console.log(`Started ${uuid}`);
  });

db.command("stop <uuid>")
  .description("Stop a database")
  .option("-y, --yes", "Skip confirmation")
  .action(async (uuid: string, opts: { yes?: boolean }) => {
    await confirmDestructive("stop database", uuid, Boolean(opts.yes));
    await getClient().db.stop(uuid);
    console.log(`Stopped ${uuid}`);
  });

db.command("restart <uuid>")
  .description("Restart a database")
  .action(async (uuid: string) => {
    await getClient().db.restart(uuid);
    console.log(`Restarted ${uuid}`);
  });

registerDbWriteCommands(db, getClient);

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
    printResult(result);
  });

svc
  .command("get <uuid>")
  .description("Get a single service")
  .action(async (uuid: string) => {
    const g = program.opts<GlobalOpts>();
    const result = await getService(getClient(), uuid, { verbosity: resolveVerbosity(g) });
    printResult(result);
  });

registerSvcWriteCommands(svc, getClient);

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
    printResult(result);
  });

deploy
  .command("get <uuid>")
  .description("Get a deployment")
  .action(async (uuid: string) => {
    const g = program.opts<GlobalOpts>();
    const result = await getDeployment(getClient(), uuid, { verbosity: resolveVerbosity(g) });
    printResult(result);
  });

deploy
  .command("trigger")
  .description("Trigger a deploy")
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
    printResult(result);
  });

server
  .command("get <uuid>")
  .description("Get a single server")
  .action(async (uuid: string) => {
    const g = program.opts<GlobalOpts>();
    const result = await getServer(getClient(), uuid, { verbosity: resolveVerbosity(g) });
    printResult(result);
  });

registerServerWriteCommands(server, getClient);

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
    printResult(result);
  });

project
  .command("get <uuid>")
  .description("Get a single project")
  .action(async (uuid: string) => {
    const g = program.opts<GlobalOpts>();
    const result = await getProject(getClient(), uuid, { verbosity: resolveVerbosity(g) });
    printResult(result);
  });

registerProjectWriteCommands(project, getClient);

// ----------------------------------------------------------------
// search
// ----------------------------------------------------------------

program
  .command("search <query>")
  .description("Smart search across apps/db/svc/servers/projects")
  .option("--kind <kinds...>", "Filter kinds")
  .option("--limit <n>", "Max results", "20")
  .option("--threshold <n>", "Fuzzy threshold (0..1)", "0.4")
  .action(async (query: string, opts: { kind?: string[]; limit?: string; threshold?: string }) => {
    const result = await searchResources(getClient(), query, {
      // biome-ignore lint/suspicious/noExplicitAny: commander variadic passes strings
      kinds: opts.kind as any,
      limit: opts.limit ? Number(opts.limit) : undefined,
      fuzzyThreshold: opts.threshold ? Number(opts.threshold) : undefined,
    });
    printResult(result);
  });

// ----------------------------------------------------------------
// Entry
// ----------------------------------------------------------------

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
