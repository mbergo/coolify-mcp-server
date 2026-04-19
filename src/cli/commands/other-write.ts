/**
 * Service / project / server create + delete + update commands.
 */

import type { Command } from "commander";
import type { CoolifyApiClient } from "../../core/api-client.js";
import { resolveConfig } from "../../core/config.js";
import { createProject, createServer, createService } from "../../core/create-with-naming.js";
import type { CreateServiceInput } from "../../core/types.js";
import { confirmDestructive } from "../prompt.js";

function parseFields(fields: string[]): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const f of fields) {
    const idx = f.indexOf("=");
    if (idx < 0) throw new Error(`Malformed --field "${f}". Use key=value.`);
    const key = f.slice(0, idx);
    const rawVal = f.slice(idx + 1);
    if (rawVal === "true") out[key] = true;
    else if (rawVal === "false") out[key] = false;
    else if (/^-?\d+(\.\d+)?$/.test(rawVal)) out[key] = Number(rawVal);
    else out[key] = rawVal;
  }
  return out;
}

// ----------------------------------------------------------------
// Services
// ----------------------------------------------------------------

export function registerSvcWriteCommands(svc: Command, getClient: () => CoolifyApiClient): void {
  svc
    .command("create")
    .description("Create a service")
    .requiredOption("--server <uuid>")
    .requiredOption("--project <uuid>")
    .requiredOption("--type <type>", "Service type (e.g. plausible, n8n, outline)")
    .option("--name <name>")
    .option("--environment <name>")
    .option("--description <text>")
    .option("--instant-deploy")
    .action(
      async (opts: {
        server: string;
        project: string;
        type: string;
        name?: string;
        environment?: string;
        description?: string;
        instantDeploy?: boolean;
      }) => {
        const cfg = resolveConfig();
        const input: CreateServiceInput = {
          server_uuid: opts.server,
          project_uuid: opts.project,
          environment_name: opts.environment,
          type: opts.type,
          name: opts.name,
          description: opts.description,
          instant_deploy: opts.instantDeploy,
        };
        const result = await createService(getClient(), input, {
          name: opts.name,
          fallbackBase: opts.name ?? opts.type,
          policy: cfg.namingCollision,
          suffix: cfg.namingSuffix,
        });
        console.log(
          JSON.stringify(
            { uuid: result.create.uuid, name: result.finalName, collided: result.collided },
            null,
            2,
          ),
        );
      },
    );

  svc
    .command("delete <uuid>")
    .description("Delete a service")
    .option("-y, --yes", "Skip confirmation")
    .action(async (uuid: string, opts: { yes?: boolean }) => {
      await confirmDestructive("delete service", uuid, Boolean(opts.yes));
      await getClient().svc.delete(uuid);
      console.log(`Deleted ${uuid}`);
    });

  svc
    .command("update <uuid>")
    .description("Update a service")
    .option("--field <key=value...>", "Field updates (repeatable)")
    .action(async (uuid: string, opts: { field?: string[] }) => {
      const patch = parseFields(opts.field ?? []);
      if (Object.keys(patch).length === 0) {
        throw new Error("No fields provided. Use --field key=value (can repeat).");
      }
      await getClient().svc.update(uuid, patch);
      console.log(`Updated ${uuid}: ${JSON.stringify(patch)}`);
    });

  svc
    .command("start <uuid>")
    .description("Start a service")
    .action(async (uuid: string) => {
      await getClient().svc.start(uuid);
      console.log(`Started ${uuid}`);
    });

  svc
    .command("stop <uuid>")
    .description("Stop a service")
    .action(async (uuid: string) => {
      await getClient().svc.stop(uuid);
      console.log(`Stopped ${uuid}`);
    });

  svc
    .command("restart <uuid>")
    .description("Restart a service")
    .action(async (uuid: string) => {
      await getClient().svc.restart(uuid);
      console.log(`Restarted ${uuid}`);
    });
}

// ----------------------------------------------------------------
// Projects
// ----------------------------------------------------------------

export function registerProjectWriteCommands(
  project: Command,
  getClient: () => CoolifyApiClient,
): void {
  project
    .command("create")
    .description("Create a project")
    .requiredOption("--name <name>", "Project name")
    .option("--description <text>")
    .action(async (opts: { name: string; description?: string }) => {
      const cfg = resolveConfig();
      const result = await createProject(
        getClient(),
        { name: opts.name, description: opts.description },
        { policy: cfg.namingCollision, suffix: cfg.namingSuffix },
      );
      console.log(
        JSON.stringify(
          { uuid: result.create.uuid, name: result.finalName, collided: result.collided },
          null,
          2,
        ),
      );
    });

  project
    .command("delete <uuid>")
    .description("Delete a project")
    .option("-y, --yes", "Skip confirmation")
    .action(async (uuid: string, opts: { yes?: boolean }) => {
      await confirmDestructive("delete project", uuid, Boolean(opts.yes));
      await getClient().project.delete(uuid);
      console.log(`Deleted ${uuid}`);
    });

  project
    .command("update <uuid>")
    .description("Update a project")
    .option("--field <key=value...>", "Field updates (repeatable)")
    .action(async (uuid: string, opts: { field?: string[] }) => {
      const patch = parseFields(opts.field ?? []);
      if (Object.keys(patch).length === 0) {
        throw new Error("No fields provided. Use --field key=value (can repeat).");
      }
      await getClient().project.update(uuid, patch);
      console.log(`Updated ${uuid}: ${JSON.stringify(patch)}`);
    });
}

// ----------------------------------------------------------------
// Servers
// ----------------------------------------------------------------

export function registerServerWriteCommands(
  server: Command,
  getClient: () => CoolifyApiClient,
): void {
  server
    .command("create")
    .description("Register a server")
    .requiredOption("--name <name>")
    .requiredOption("--ip <ip>", "SSH-reachable IP")
    .requiredOption("--private-key <uuid>", "Private key UUID")
    .option("--port <port>", "SSH port", Number)
    .option("--user <user>", "SSH user", "root")
    .option("--description <text>")
    .option("--build-server")
    .option("--validate")
    .action(
      async (opts: {
        name: string;
        ip: string;
        privateKey: string;
        port?: number;
        user?: string;
        description?: string;
        buildServer?: boolean;
        validate?: boolean;
      }) => {
        const cfg = resolveConfig();
        const result = await createServer(
          getClient(),
          {
            name: opts.name,
            ip: opts.ip,
            port: opts.port,
            user: opts.user,
            private_key_uuid: opts.privateKey,
            description: opts.description,
            is_build_server: opts.buildServer,
            instant_validate: opts.validate,
          },
          { policy: cfg.namingCollision, suffix: cfg.namingSuffix },
        );
        console.log(
          JSON.stringify(
            { uuid: result.create.uuid, name: result.finalName, collided: result.collided },
            null,
            2,
          ),
        );
      },
    );

  server
    .command("delete <uuid>")
    .description("Delete a server")
    .option("-y, --yes", "Skip confirmation")
    .action(async (uuid: string, opts: { yes?: boolean }) => {
      await confirmDestructive("delete server", uuid, Boolean(opts.yes));
      await getClient().server.delete(uuid);
      console.log(`Deleted ${uuid}`);
    });

  server
    .command("update <uuid>")
    .description("Update a server")
    .option("--field <key=value...>", "Field updates (repeatable)")
    .action(async (uuid: string, opts: { field?: string[] }) => {
      const patch = parseFields(opts.field ?? []);
      if (Object.keys(patch).length === 0) {
        throw new Error("No fields provided. Use --field key=value (can repeat).");
      }
      await getClient().server.update(uuid, patch);
      console.log(`Updated ${uuid}: ${JSON.stringify(patch)}`);
    });
}
